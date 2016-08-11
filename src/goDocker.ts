/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------*/

'use strict';
import {Stream, Duplex} from 'stream';
import vscode = require('vscode');
import * as Docker from 'dockerode';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

function exec(container: Docker.Container, cmd: string, args: string[], stdin?: Stream): Thenable<{ stdout: string; stderr: string; err: number; data: Docker.ExecInspectData;}> {

	const options = {
		AttachStdin: true,
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
				hijack: true,
				stdin: true
			}, function (err, stream) {

				if (err) {
					reject(err);
					return;
				};

				if (stdin) {
					stdin.pipe(stream);
				}

				const stdout: Buffer[] = [];
				const stderr: Buffer[] = [];

				// de-multiplex into 'streams'
				const _stdout = { write: stdout.push.bind(stdout) } as any;
				const _stderr = { write: stderr.push.bind(stderr) } as any;

				docker.modem.demuxStream(stream, _stdout, _stderr);

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

	const stdin = new class extends Duplex {

		private _chunks: any[] = [];

		_write(chunk, encoding, callback) {
			this._chunks.push(chunk);
			callback();
		}

		_read(size) {
			this.push(this._chunks.length > 0 ? this._chunks.shift() : null);
		}
	}

	getContainer().then(container => exec(container, cmd, args, stdin))
		.then(value => callback(value.err, value.stdout, value.stderr), err => callback(err, undefined, undefined));


	// looks like a child process...
	return {
		stdin
	};
}


let _containerPromise: Thenable<any>;

export function getContainer(image: string = 'joaomoreno/vscode-go'): Thenable<any> {

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