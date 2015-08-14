var fs = require('fs');
var box_sdk = require('box-sdk');

var options = {}; // See parseArgs()

var gsms;
try {
    gsms = require('./gsms');
} catch (e) {
    console.log('Unable to locate gsms.json (did you run init.js?)');
    return false;
}

var exec = require('child_process').exec, child;

function parseArgs() {
    var args = process.argv;
    if (args.length < 3) {
        return false;
    }
    options.file    = args[2];
    options.webroot = args[3] || '/';
    return true;
}

function usage() {
    console.log('Usage: node cp.js file [webroot]');
    console.log('Examp: node cp.js file.txt /some/path');
}

function getByPath(name, fileTree) {
    var node = fileTree["/"];
    for (var i = 0; i < name.length; i++) {
        if (name[i] !== '') node = node.children[name[i]];
    }
    return node;
}

function upload(name, path, fileTree, connection, callback) {
    var webroot = getByPath(path.split('/'), fileTree);
    if (!webroot) {
        return callback('Path does not exist');
    }
    var searchOpts = {
        'ancestor_folder_ids': [webroot.id].join(','),
        'scope': 'user_content',
    };
    if (webroot.id === 1) delete searchOpts.ancestor_folder_ids;
    connection.search(name, searchOpts, function (error, body) {
        body = eval(body);
    if (body.total_count !== 0) {
        // KNOWN BUG: Picks first file even if it is in a subfolder :(
        connection.log.debug('uploadFileNewVersion '+name+' '+body.entries[0].id);
        var curl = 'curl https://upload.box.com/api/2.0/files/'+body.entries[0].id+'/content -H "Authorization: Bearer '+connection.access_token+'" -F file=@'+name;
        child = exec(curl, callback);
    } else {
        connection.log.debug('uploadFile '+name+' '+webroot.id);
        var curl = 'curl https://upload.box.com/api/2.0/files/content -H "Authorization: Bearer '+connection.access_token+'" -X POST -F attributes=\'{"name":"'+name.split('/').pop()+'", "parent":{"id":"'+webroot.id+'"}}\' -F file=@'+name;
        child = exec(curl, callback);
    }
    });
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
    }, gsms.log);

    connection = box.getConnection(gsms.email);

    // Restore access_token and refresh_token if possible
    connection._setTokens({access_token: gsms.access_token, refresh_token: gsms.refresh_token, expires_in: 1});

    //Navigate user to the auth URL if neccessary
    if (!connection.isAuthenticated()) {
        console.log('Open '+connection.getAuthURL()+' in a browser');
    }

    connection.ready(function() {
        // Save gsms
        gsms.access_token = connection.access_token;
        gsms.refresh_token = connection.refresh_token;
        // Dummy call to refresh tokens if neccessary
        connection.getFolderInfo(0, function (body) {
            var wait = 0;
            if (!connection.isAuthenticated()) {
                console.log('The auth gods are angry! Exiting, please rerun init.js');
                box.stopServer();
                return false;
            }
            setTimeout(function() {
                gsms.access_token = connection.access_token;
                gsms.refresh_token = connection.refresh_token;
                fs.writeFile('gsms.json', JSON.stringify(gsms), function(err) {
                    upload(options.file, options.webroot, gsms.fileTree, connection,
                            function (err) {
                                if (err) connection.log.info(err);
                                box.stopServer(function(){});
                            });
                });
            }, wait);
        });
    });
})();
