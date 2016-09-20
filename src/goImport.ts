/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import cp = require('child_process');
import { getBinPath } from './goPath';
import { parseFilePrelude } from './util';
import { promptForMissingTool } from './goInstallTools';
import path = require('path');

export function listPackages(): Thenable<string[]> {
	let gopkgsPromise = new Promise<string[]>((resolve, reject) => {
		cp.execFile(getBinPath('gopkgs'), [], (err, stdout, stderr) => {
			if (err && (<any>err).code === 'ENOENT') {
				promptForMissingTool('gopkgs');
				return reject();
			}
			let lines = stdout.split('\n');
			return resolve(lines);
		});
	});

	let govendorPromise = new Promise<string[]>((resolve, reject) => {
		let fileDir = path.dirname(vscode.window.activeTextEditor.document.fileName);
		cp.execFile(getBinPath('govendor'), ['list', '-no-status', '+v'], {cwd: fileDir}, (err, stdout, stderr) => {
			if (err && (<any>err).code === 'ENOENT') {
				promptForMissingTool('govendor');
				return reject();
			}
			let lines = stdout.split('\n');
			return resolve(lines);
		});
	});

	return Promise.all<string[]>([gopkgsPromise, govendorPromise]).then(([pkgs, vendorPkgs]) => {
		// No vendor packages found for this workspace, return pkgs
		if (!vendorPkgs || vendorPkgs.length === 0) {
			return pkgs.sort();
		}

		let updatedPkgs: string[] = [];

		pkgs.forEach(pkg => {
			if (!pkg) {
				return;
			}

			let vendorIndex = pkg.indexOf('/vendor/');
			if (vendorIndex > 0) {
				let vendorPackageRelativePath = pkg.substr(vendorIndex + 8);
				if (vendorPackageRelativePath && vendorPkgs.indexOf(vendorPackageRelativePath) > -1) {
					// When a vendor package for a project/repo already exists outside the current project,
					// pkgs would already have an entry for it.
					// In which case, we can skip adding the vendor package to the list
					// Example: Assume package 'a' is installed from github.com/somerepo/a to $GOPATH
					//          The current project github.com/someotherrepo/b may have a version of a as a vendor package
					// 			github.com/someotherrepo/b/vendor/github.com/somerepo/a
					// 			In this case, github.com/somerepo/a would already be returned by goPkgs
					if (pkgs.indexOf(vendorPackageRelativePath) === -1) {
						updatedPkgs.push(vendorPackageRelativePath);
					}
					return;
				}
			}
			// pkg is not a vendor project or is a vendor project not belonging to current project
			updatedPkgs.push(pkg);

		});
		updatedPkgs = updatedPkgs.sort();
		return updatedPkgs;
	});
}

function askUserForImport(): Thenable<string> {
	return listPackages().then(packages => {
		return vscode.window.showQuickPick(packages);
	});
}

export function addImport(arg: string) {
	let p = arg ? Promise.resolve(arg) : askUserForImport();
	p.then(imp => {
		// Import name wasn't provided
		if (imp === undefined) {
			return null;
		}

		let {imports, pkg} = parseFilePrelude(vscode.window.activeTextEditor.document.getText());
		let multis = imports.filter(x => x.kind === 'multi');
		if (multis.length > 0) {
			// There is a multiple import declaration, add to the last one
			let closeParenLine = multis[multis.length - 1].end;
			return vscode.window.activeTextEditor.edit(editBuilder => {
				editBuilder.insert(new vscode.Position(closeParenLine, 0), '\t"' + imp + '"\n');
			});
		} else if (imports.length > 0) {
			// There are only single import declarations, add after the last one
			let lastSingleImport = imports[imports.length - 1].end;
			return vscode.window.activeTextEditor.edit(editBuilder => {
				editBuilder.insert(new vscode.Position(lastSingleImport + 1, 0), 'import "' + imp + '"\n');
			});
		} else if (pkg && pkg.start >= 0) {
			// There are no import declarations, but there is a package declaration
			return vscode.window.activeTextEditor.edit(editBuilder => {
				editBuilder.insert(new vscode.Position(pkg.start + 1, 0), '\nimport (\n\t"' + imp + '"\n)\n');
			});
		} else {
			// There are no imports and no package declaration - give up
			return null;
		}
	});
}
