const fs = require("fs");
const path = require("path");

function FileSystemStorageService(options) {
  this._rootDirectory = options.rootDirectory;
}

FileSystemStorageService.prototype.load = function(callback) {
  var result = { files: [], users: [] };
  
  makeRequiredDirectory(path.join(this._rootDirectory, "users"));
  makeRequiredDirectory(path.join(this._rootDirectory, "files"));
  
  try {
    loadDirectory(path.join(this._rootDirectory, "users"), result.users);
    loadDirectory(path.join(this._rootDirectory, "files"), result.files);
  } catch (e) {
    callback(e);
    return;
  }
  
  callback(null, result);
  
  function loadDirectory(directory, target) {
    fs.readdirSync(directory).forEach((itemDir) => {
      if (itemDir.substr(0, 1) !== ".") {
        target.push({
          id: itemDir,
          main: fs.readFileSync(path.join(directory, itemDir, "main")),
          groups: fs.readFileSync(path.join(directory, itemDir, "groups"))
        });
      }
    });
  }
};

FileSystemStorageService.prototype.addItem = function(id, itemType, mainData, groupData, callback) {
  var returned = false;
  
  fs.mkdir(path.join(this._rootDirectory, itemType, id), 0o700, (err) => {
    var streamMain, streamGroups, nComplete = 0;
    
    if (err) {
      if (err.code === "EEXIST") {
        finish(new Error("Item with this id already exists"));
      } else {
        finish(err);
      }
      return;
    }
    streamMain = fs.createWriteStream(path.join(this._rootDirectory, itemType, id, "main"), {mode: 0o600, flags: "w"});
    streamGroups = fs.createWriteStream(path.join(this._rootDirectory, itemType, id, "groups"), {mode: 0o600, flags: "w"});
  
    streamMain.on("error", finish);
    streamGroups.on("error", finish);
    
    streamMain.end(mainData, onStreamFinish);
    streamGroups.end(groupData, onStreamFinish);
  
    function onStreamFinish() {
      nComplete++;
      if (nComplete === 2) {
        finish();
      }
    }
  });
  
  function finish(err) {
    if (returned) {
      return;
    }
    returned = true;
    callback(err);
  }
};

FileSystemStorageService.prototype.updateMainData = function(id, itemType, mainData, callback) {
  this._updateData(path.join(this._rootDirectory, itemType, id, "main"), mainData, callback);
};

FileSystemStorageService.prototype.updateGroupData = function(id, itemType, groupData, callback) {
  this._updateData(path.join(this._rootDirectory, itemType, id, "groups"), groupData, callback);
};


FileSystemStorageService.prototype._updateData = function(filePath, data, callback) {
  var streamData, returned = false;
  
  streamData = fs.createWriteStream(filePath, {mode: 0o600, flags: "w"});
  streamData.on("error", finish);
  streamData.end(data, finish);
  
  function finish(err) {
    if (returned) {
      return;
    }
    returned = true;
    callback(err);
  }
};

function makeRequiredDirectory(directory) {
  try {
    fs.mkdirSync(directory, 0o600);
  } catch (e) {
    if (e.code !== "EEXIST") {
      throw e;
    }
  }
}

exports.create = function(options) {
  return new FileSystemStorageService(options);
};

