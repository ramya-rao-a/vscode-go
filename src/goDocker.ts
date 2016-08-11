/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
var Docker = require('dockerode');
var docker = new Docker({ socketPath: '/var/run/docker.sock' });


export function execContainer(cmd: string, args: string[], options: any, callback: (err: any, stdout: string, stderr: string) => void) {
	
	getContainer().then(container => {
		
		const options = {
			AttachStdout: true,
			AttachStderr: true,
			Tty: false,
			Cmd: [cmd].concat(args)
		};

		container.exec(options, function (err, exec) {
			if (err) {
				callback(err, undefined, undefined);
				return;
			};

			exec.start(function (err, stream) {

				if (err) {
					callback(err, undefined, undefined);
					return;
				};

				let data = '';

				stream.setEncoding('utf8');
				stream.on('error', err => {
					callback(err, undefined, undefined);
				});
				stream.on('data', part => {
					data += part;
				});
				stream.on('end', () => {
					callback(undefined, data, undefined);
				});
			});
		});

	}, err => {
		callback(err, undefined, undefined);
	});
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