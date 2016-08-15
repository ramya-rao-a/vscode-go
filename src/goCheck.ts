/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import cp = require('child_process');
import path = require('path');
import os = require('os');
import fs = require('fs');
import { getBinPath, getGoRuntimePath, convertToGoPathFromLocalPath , convertToLocalPathFromGoPath} from './goPath';
import { getCoverage } from './goCover';
import { outputChannel } from './goStatus';
import { promptForMissingTool } from './goInstallTools';
import { execContainer } from './goDocker';

export interface ICheckResult {
	file: string;
	line: number;
	msg: string;
	severity: string;
}

function runTool(cmd: string, args: string[], cwd: string, severity: string, useStdErr: boolean, toolName: string, notFoundError?: string) {
	return new Promise((resolve, reject) => {

		execContainer(cmd, args, { cwd: cwd}, (err, stdout, stderr) => {
		// cp.execFile(cmd, args, { cwd: cwd }, (err, stdout, stderr) => {
			console.log(err, stdout, stderr);
			try {
				if (err && (<any>err).code === 'ENOENT') {
					if (toolName) {
						promptForMissingTool(toolName);
					} else {
						vscode.window.showInformationMessage(notFoundError);
					}
					return resolve([]);
				}
				let lines = (useStdErr ? stderr : stdout).toString().split('\n');
				outputChannel.appendLine(['Finished running tool:', cmd, ...args].join(' '));

				let ret: ICheckResult[] = [];
				for (let i = 0; i < lines.length; i++) {
					if (lines[i][0] === '\t' && ret.length > 0) {
						ret[ret.length - 1].msg += '\n' + lines[i];
						continue;
					}
					let match = /^([^:]*: )?((.:)?[^:]*):(\d+)(:(\d+)?)?:(?:\w+:)? (.*)$/.exec(lines[i]);
					if (!match) continue;
					let [_, __, file, ___, lineStr, ____, charStr, msg] = match;
					let line = +lineStr;
					file = convertToLocalPathFromGoPath(path.resolve(cwd, file));
					ret.push({ file, line, msg, severity });
					outputChannel.appendLine(`${file}:${line}: ${msg}`);
				}
				outputChannel.appendLine('');
				resolve(ret);
			} catch (e) {
				reject(e);
			}
		});
	});
}

export function check(filename: string, goConfig: vscode.WorkspaceConfiguration): Promise<ICheckResult[]> {
	outputChannel.clear();
	let runningToolsPromises = [];
	filename = convertToGoPathFromLocalPath(filename);
	let cwd = path.dirname(filename);

	if (!!goConfig['buildOnSave']) {
		let buildFlags = goConfig['buildFlags'] || [];
		let buildTags = '"' + goConfig['buildTags'] + '"';
		let tmppath = path.normalize(path.join(os.tmpdir(), 'go-code-check'));
		// adding the actual cwd (relative to /go) to the actual build arguments
		let args = ['build', '-o', tmppath, '-tags', buildTags, ...buildFlags, '../' + cwd];
		if (filename.match(/_test.go$/i)) {
			args = ['test', '-copybinary', '-o', tmppath, '-c', '-tags', buildTags, ...buildFlags, '../' + cwd];
		}
		runningToolsPromises.push(runTool(
			'go', // use 'go' command directly. In the container, this $GOROOT/bin would be part of $PATH 
			args,
			'/go', // in the container /go would be the cwd. TODO: set cwd in goDocker while starting the container and use the same here
			'error',
			true,
			null,
			'No "go" binary could be found in GOROOT: ' + process.env['GOROOT'] + '"'
		));
	}
	if (!!goConfig['lintOnSave']) {
		let lintTool = getBinPath(goConfig['lintTool'] || 'golint');
		let lintFlags = goConfig['lintFlags'] || [];
		let args = [...lintFlags];

		if (lintTool === 'golint') {
			args.push(filename);
		}

		runningToolsPromises.push(runTool(
			lintTool,
			args,
			'/go', // in the container /go would be the cwd. TODO: set cwd in goDocker while starting the container and use the same here
			'warning',
			lintTool === 'golint',
			lintTool === 'golint' ? 'golint' : null,
			lintTool === 'golint' ? undefined : 'No "gometalinter" could be found.  Install gometalinter to use this option.'
		));
	}

	if (!!goConfig['vetOnSave']) {
		let vetFlags = goConfig['vetFlags'] || [];
		runningToolsPromises.push(runTool(
			'go', /// use 'go' command directly. In the container, this $GOROOT/bin would be part of $PATH
			['tool', 'vet', ...vetFlags, filename],
			'/go', // in the container /go would be the cwd. TODO: set cwd in goDocker while starting the container and use the same here
			'warning',
			true,
			null,
			'No "go" binary could be found in GOROOT: "' + process.env['GOROOT'] + '"'
		));
	}

	if (!!goConfig['coverOnSave']) {
		runningToolsPromises.push(getCoverage(filename));
	}

	return Promise.all(runningToolsPromises).then(resultSets => [].concat.apply([], resultSets));
}
