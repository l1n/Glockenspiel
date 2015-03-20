var box_sdk = require('box-sdk');
var xdg_open = require('open');

var options = {}; // See parseArgs()
var fileTree = {};

var gsms = {
    client_id:       'tul5x43dwghbz7dque6h0z04py06b4oc',
    client_secret:   'IWQeQ09keAHchQlGGllzOoAJlIXvtF4g',
    developer_token: 'BPzH8UgmXlRuULmNUA2249EHznAJftjL',
    api_key:         'tul5x43dwghbz7dque6h0z04py06b4oc',
    port:            5000,
    host:            'localhost' //default localhost
};

function parseArgs() {
    var args = process.argv;
    if (args.length < 2) {
        return false;
    }
    options.email   = args[2];
    options.webroot = args[3] || '/';
    return true;
}

function usage() {
    console.log('Usage: node server.js email [webroot]');
    console.log('Examp: node server.js user@example.com /some/path');
}

function walkFileTree(id, connection, fileTree) {
        connection.getFolderItems(id, {'fields': ['name', 'id', 'size']}, function (error, body) {
            body=eval(body);
            for(var i = 0; i < body.total_count; i++) {
                var node = body.entries[i];
                //console.log(node);
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
    for (var i = 0; i < name.length; i++) {
        if (name[i] !== '') node = node.children[name[i]];
    }
    return node;
}

function uploadWithOverwrite(name, path, fileTree, connection) {
    var webroot = getByPath(path.split('/'), fileTree);
    if (!webroot.children['name']) {
        console.log('uploadFileNewVersion '+name+' '+webroot.id);
        connection.uploadFileNewVersion(name, webroot.id);
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
        var box = box_sdk.Box(gsms, 1);
        connection = box.getConnection(options.email);
        //Navigate user to the auth URL
        xdg_open(connection.getAuthURL());

        connection.ready(function () {
                connection.uploadFile('test3', 0);
                fileTree = {"/": {"type": "folder","parent":fileTree,"children":{},"permissions":{"mode": 040777, "nlink": 1}, "size": 4096, "id": 0}};
                fileTree["/"] = walkFileTree(0, connection, fileTree["/"]);
                uploadWithOverwrite('test2', webroot.id, fileTree, connection);
        });
})();
