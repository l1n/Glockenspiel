var fs = require('fs');
var box_sdk = require('box-sdk');
var xdg_open = require('open');

var options = {}; // See parseArgs()
var fileTree = {};

var gsms = require('./gsms');
function parseArgs() {
	var args = process.argv;
	if (args.length < 3) {
		return false;
	}
	options.email   = args[2];
	options.file    = args[3];
	options.webroot = args[4] || '/';
	return true;
}

function usage() {
	console.log('Usage: node server.js email file [webroot]');
	console.log('Examp: node server.js user@example.com file.txt /some/path');
}

function walkFileTree(id, connection, fileTree) {
	connection.getFolderItems(id, {'fields': ['name', 'id'].join(',')}, function (error, body) {
		body=eval(body);
		for(var i = 0; i < body.total_count; i++) {
			var node = body.entries[i];
			// console.log(node);
			if (node.type === 'folder') {
				fileTree.children[node.name] = {"type": "folder","parent":fileTree,"children":{},"permissions":{"mode": 040777, "nlink": 1,"size": 4096}, "id": parseInt(node.id), "name": node.name};
				fileTree.children[node.name] = walkFileTree(fileTree.children[node.name].id, connection, fileTree.children[node.name]);
			} else {
				fileTree.children[node.name] = {"type": "file", "parent":fileTree,"children":{},"permissions":{"mode": 0100666, "nlink": 1,"size": node.size}, "id": parseInt(node.id), "name": node.name};
				//console.log(node);
			}
		}
	});
	return fileTree;
}
function getByPath(name, fileTree) {
	var node = fileTree["/"];
	console.log(node);
	for (var i = 0; i < name.length; i++) {
		if (name[i] !== '') node = node.children[name[i]];
	}
	return node;
}

function uploadWithOverwrite(name, path, fileTree, connection) {
	var webroot = getByPath(path.split('/'), fileTree);
	console.log(webroot.children);
	if (webroot.children['name']) {
		console.log('uploadFileNewVersion '+name+' '+webroot.id);
		connection.uploadFileNewVersion(name, webroot.id, null, function (err) {console.log(err);});
	} else {
		console.log('uploadFile '+name+' '+webroot.id);
		connection.uploadFile(name, webroot.id);
	}
}

(function main() {
	if (!parseArgs()) {
		usage();
		return -1;
	}
	var box = box_sdk.Box({
		client_id:     gsms.access_token,
		client_secret: gsms.access_token,
		host:          gsms.host,
		port:          gsms.port,
	}, 1);
	connection = box.getConnection(options.email);
	// Restore access_token and refresh_token if possible
	connection.access_token =  gsms.access_token;
	connection.refresh_token = gsms.refresh_token;
	//Navigate user to the auth URL if neccessary
	if (!connection.refresh_token) xdg_open(connection.getAuthURL());

	connection.ready(function () {
		gsms.access_token = connection.access_token;
		gsms.refresh_token = connection.refresh_token;
		fs.writeFile('gsms.json', JSON.stringify(gsms, null, 4), function(err) {
			fileTree = {"/": {"type": "folder","parent":fileTree,"children":{},"permissions":{"mode": 040777, "nlink": 1}, "size": 4096, "id": 0}};
			fileTree["/"] = walkFileTree(0, connection, fileTree["/"]);
			setTimeout(function(){
				console.log(fileTree);
				uploadWithOverwrite('test2', options.webroot, fileTree, connection);},2000);
		});
	});
})();
