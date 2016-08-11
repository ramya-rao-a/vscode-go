/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
var Docker = require('dockerode');
var docker = new Docker({ socketPath: '/var/run/docker.sock' });


export function exec(container: any, cmd: string, args: string[]): Thenable<{ stdout: string; stderr: string; err: number; data: any;}> {

	const options = {
		AttachStdout: true,
		AttachStderr: true,
		Tty: false,
		Cmd: [cmd].concat(args)
	};

	return new Promise((resolve, reject) => {

		container.exec(options, function (err, exec) {
			if (err) {
				reject(err);
				return;
			};

			exec.start({
				hijack: true
			}, function (err, stream) {

				if (err) {
					reject(err);
					return;
				};

				const stdout: Buffer[] = [];
				const stderr: Buffer[] = [];

				// de-multiplex into 'streams'
				docker.modem.demuxStream(stream, { write: stdout.push.bind(stdout) }, { write: stderr.push.bind(stderr) });

				// stream.setEncoding('utf8');
				stream.on('error', err => {
					reject(err);
				});
				
				stream.on('end', () => {

					exec.inspect(function (err, data) {

						if (err) {
							reject(err);
							return;
						}

						resolve({
							data,
							err: data.ExitCode !== 0 ? data.ExitCode : undefined,
							stdout: Buffer.concat(stdout).toString(),
							stderr: Buffer.concat(stderr).toString()
						});
					});
				});
			});
		});

	});
}

export function execContainer(cmd: string, args: string[], options: any, callback: (err: any, stdout: string, stderr: string) => void) {

	getContainer().then(container => exec(container, cmd, args))
		.then(value => callback(value.err, value.stdout, value.stderr), err => callback(err, undefined, undefined));
}


let _containerPromise: Thenable<any>;

export function getContainer(image: string = 'joh-go'): Thenable<any> {

	if (!_containerPromise) {
		_containerPromise = new Promise((resolve, reject) => {
			docker.createContainer({
				Image: image,
				'Volumes': { [`${vscode.workspace.rootPath}`]: {} },
				"HostConfig": {
					"Binds": [`${vscode.workspace.rootPath}:${vscode.workspace.rootPath}`]
				}
			}, function (err, container) {

				if (err) {
					reject(err);
					return;
				}

				container.start(function (err, data) {
					if (err) {
						reject(err);
						return;
					} else {
						resolve(container);
						return;
					}
				});
			});
		});
	}

	return _containerPromise;
}