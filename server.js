var fs = require('fs');
var box_sdk = require('box-sdk');
var async = require('async');

var options = {}; // See parseArgs()
var fileTree = {};

var gsms;
try {
    gsms = require('./gsms');
} catch (e) {
    gsms = {
        "email": "",
        "host": "localhost",
        "port": 5000,
        "client_id": "tul5x43dwghbz7dque6h0z04py06b4oc",
        "client_secret": "IWQeQ09keAHchQlGGllzOoAJlIXvtF4g",
        "access_token": "",
        "refresh_token": ""
    };
}
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

function walkFileTree(id, connection, fileTree, cb) {
    connection.getFolderItems(id, {'fields': ['name', 'id'].join(',')}, function (error, body) {
        body=eval(body);
        async.each(body.entries, function (node, callback) {
            fileTree.children[node.name] = {"parent":fileTree,"children":{}, "id": parseInt(node.id), "name": node.name};
            if (node.type === 'folder') {
                fileTree.children[node.name].type = "folder";
                walkFileTree(fileTree.children[node.name].id, connection, fileTree.children[node.name], function (e, ft) {
                    fileTree.children[node.name] = ft;
                    callback(null, fileTree);
                });
            } else {
                fileTree.children[node.name].type = "file";
                connection.getFileInfo(parseInt(node.id), function(e, res) {
                    res = eval(res);
                    fileTree.children[node.name].etag = parseInt(res.etag);
                    callback(null, fileTree);
                });
            }
            // console.log(node);
        }, function (err, result) {
            cb(null, fileTree);
        });
    });
}

function getByPath(name, fileTree) {
    var node = fileTree["/"];
    for (var i = 0; i < name.length; i++) {
        console.log(node);
        if (name[i] !== '') node = node.children[name[i]];
    }
    return node;
}

function uploadWithOverwrite(name, path, fileTree, connection, callback) {
    var webroot = getByPath(path.split('/'), fileTree);
    if (webroot.children[name]) {
        console.log('uploadFileNewVersion '+name+' '+webroot.id);
        var curl = 'curl https://upload.box.com/api/2.0/files/'+webroot.children[name].id+'/content -H "Authorization: Bearer '+connection.access_token+'" -F file=@'+name;
        var exec = require('child_process').exec, child;
        child = exec(curl, callback);
    } else {
        console.log('uploadFile '+name+' '+webroot.id);
        var curl = 'curl https://upload.box.com/api/2.0/files/content -H "Authorization: Bearer '+connection.access_token+'" -X POST -F attributes=\'{"name":"'+name+'", "parent":{"id":"'+webroot.id+'"}}\' -F file=@'+name;
        var exec = require('child_process').exec, child;
        child = exec(curl, callback);
    }
}

function uploadWithoutOverwrite(name, path, fileTree, connection, callback) {
    var webroot = getByPath(path.split('/'), fileTree);
    if (webroot.children['name']) {
        console.log('File exists: '+name+' '+webroot.id);
    } else {
        console.log('uploadFile '+name+' '+webroot.id);
        var curl = 'curl https://upload.box.com/api/2.0/files/content -H "Authorization: Bearer '+connection.access_token+'" -X POST -F attributes=\'{"name":"'+name+'", "parent":{"id":"'+webroot.id+'"}}\' -F file=@'+name;
        var exec = require('child_process').exec, child;
        child = exec(curl, callback);
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
        timeout:       0,
    }, 10);

    connection = box.getConnection(options.email||gsms.email);

    // Restore access_token and refresh_token if possible
    connection._setTokens({access_token: gsms.access_token, refresh_token: gsms.refresh_token, expires_in: 1});

    //Navigate user to the auth URL if neccessary
    if (!connection.isAuthenticated()) {
        console.log(connection.getAuthURL());
    }

    connection.ready(function() {
        // Save gsms
        gsms.access_token = connection.access_token;
        gsms.refresh_token = connection.refresh_token;
        // Dummy call to refresh tokens if neccessary
        connection.getFolderInfo(0, function (body) {
            var wait = 0;
            if (!connection.isAuthenticated()) {
                console.log(connection.getAuthURL());
                wait = 15*1000;
            }
            setTimeout(function() {
                gsms.access_token = connection.access_token;
                gsms.refresh_token = connection.refresh_token;
                fs.writeFile('gsms.json', JSON.stringify(gsms, null, 4), function(err) {
                    fileTree = {
                        "/": {
                            "type":     "folder",
                            "parent":   fileTree,
                            "children": {},
                            "id":       0
                        }};
                    walkFileTree(0, connection, fileTree["/"], function (err, root) {
                        fileTree["/"] = root;
                        console.log('FINAL FILE TREE: '+fileTree);
                        uploadWithOverwrite(options.file, options.webroot, fileTree, connection, function (err) {if (err) connection.log.info(err);process.exit();});
                    });
                });
            }, wait);
        });
    });
})();
