var fs = require('fs');
var request = require('request');
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

function uploadWithOverwrite(name, path, fileTree, connection, callback) {
    var webroot = getByPath(path.split('/'), fileTree);
    console.log(webroot.children);
    if (webroot.children['name']) {
        console.log('uploadFileNewVersion '+name+' '+webroot.id);
        connection.uploadFileNewVersion(name, webroot.id, null, callback);
    } else {
        console.log('uploadFile '+name+' '+webroot.id);
        connection.uploadFile(name, webroot.id, null, callback);
    }
}

function uploadWithoutOverwrite(name, path, fileTree, connection, callback) {
    var webroot = getByPath(path.split('/'), fileTree);
    console.log(webroot.children);
    if (webroot.children['name']) {
        console.log('File exists: '+name+' '+webroot.id);
    } else {
        console.log('uploadFile '+name+' '+webroot.id);
        connection.uploadFile(name, webroot.id, null, callback);
    }
}
(function main() {
    if (!parseArgs()) {
        usage();
        return -1;
    }

    var box = box_sdk.Box({
        client_id:     gsms.client_id,
        client_secret: gsms.client_secret,
        host:          gsms.host,
        port:          gsms.port,
    }, 10);

    connection = box.getConnection(options.email);

    // Restore access_token and refresh_token if possible
    connection._setTokens({access_token: gsms.access_token, refresh_token: gsms.refresh_token, expires_in: 1});

    //Navigate user to the auth URL if neccessary
    if (!connection.isAuthenticated()) {
        xdg_open(connection.getAuthURL());
    }

    connection.ready(function() {setTimeout(function () {
        // Save gsms
        gsms.access_token = connection.access_token;
        gsms.refresh_token = connection.refresh_token;
        fs.writeFile('gsms.json', JSON.stringify(gsms, null, 4), function(err) {
            // Dummy call to refresh tokens if neccessary
            connection.getFolderInfo(0, function (body) {
                fileTree = {
                    "/": {
                        "type":     "folder",
                        "parent":   fileTree,
                        "children": {},
                        "id":       0
                    }};
                fileTree["/"] = walkFileTree(0, connection, fileTree["/"]);
                setTimeout(function(){
                    uploadWithOverwrite(options.file, options.webroot, fileTree, connection, function (err) {if (err) connection.log.info(err);process.exit();});
                },2000);
            });
        });
    }, 1000)});
})();
