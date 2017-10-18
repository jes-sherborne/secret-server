const AWS = require("aws-sdk");
const helpers = require("../helpers");

function AwsS3StorageService(options) {
  options = helpers.defaults({}, options, {
    endpoint: "",
    apiVersion: "2006-03-01",
    region: "",
    s3ForcePathStyle: true,
    bucket: null,
    loadRequestsPerSecond: 300
  });
  this._bucket = options.bucket;
  this._loadRequestsPerSecond = options.loadRequestsPerSecond;
  this._s3 = new AWS.S3({
      endpoint: options.endpoint,
      apiVersion: options.apiVersion,
      region: options.region,
      s3ForcePathStyle: options.s3ForcePathStyle
    }
  );
}

AwsS3StorageService.prototype.load = function(callback) {
  var self = this;
  
  var nRemaining = 0;
  var items = {users: {}, files: {}};
  var lastError = null;
  
  this._getKeyList(function(err, keyList) {
    if (err) {
      callback(err);
      return;
    }
    loadItems(keyList);
  });
  
  function loadItems(keyList) {
    var loadsPer100ms = Math.max(Math.round(self._loadRequestsPerSecond / 10), 1);
    var nChunks, iChunk;
    nRemaining = keyList.length;
    nChunks = Math.ceil(nRemaining / loadsPer100ms);
    
    if (nRemaining === 0) {
      onLoadComplete();
    }
    
    for (iChunk = 0; iChunk < nChunks; iChunk++) {
      setTimeout(loadChunk, iChunk * 100, iChunk * loadsPer100ms);
    }
    
    function loadChunk(start) {
      for (var i = start; i < Math.min(keyList.length, start + loadsPer100ms); i++) {
        self._s3.getObject({Bucket: self._bucket, Key: keyList[i]}, onLoadItem);
      }
    }
    
  }
  
  function onLoadItem(err, result) {
    var keySplit, table, id, field;
  
    nRemaining--;
    
    if (err) {
      lastError = err;
    } else {
      keySplit = this.request.params.Key.split("/", 3);
      table = keySplit[0];
      id = keySplit[1];
      field = keySplit[2];
      if (!items[table][id]) {
        items[table][id] = {id: id};
      }
      items[table][id][field] = result.Body;
    }
    
    if (nRemaining === 0) {
      onLoadComplete();
    }
  }
  
  function onLoadComplete() {
    var result = { files: [], users: [] };
  
    if (lastError) {
      callback(lastError);
      return;
    }
  
    ["users", "files"].forEach(function(tableName) {
      var i, ids = Object.keys(items[tableName]), item;
      
      for (i = 0; i < ids.length; i++) {
        item = items[tableName][ids[i]];
        if (item.main && item.groups) {
          result[tableName].push(item);
        } else {
          lastError = new Error("Item is not complete");
        }
      }
    });
  
    if (lastError) {
      callback(lastError);
      return;
    }
    
    callback(null, result);
  }
  
};

AwsS3StorageService.prototype.addItem = function(id, itemType, mainData, groupData, callback) {
  var returned = false, nComplete = 0;
  
  this._updateData(id, itemType, "main", mainData, onUpdateComplete);
  this._updateData(id, itemType, "groups", groupData, onUpdateComplete);
  
  function onUpdateComplete(err) {
    nComplete++;
    if (nComplete === 2 || err) {
      finish(err);
    }
  }
  
  function finish(err) {
    if (returned) {
      return;
    }
    returned = true;
    callback(err);
  }
};

AwsS3StorageService.prototype.updateMainData = function(id, itemType, mainData, callback) {
  this._updateData(id, itemType, "main", mainData, callback);
};

AwsS3StorageService.prototype.updateGroupData = function(id, itemType, groupData, callback) {
  this._updateData(id, itemType, "groups", groupData, callback);
};

AwsS3StorageService.prototype._updateData = function(id, itemType, dataType, data, callback) {
  this._s3.putObject({
    Body: data,
    Bucket: this._bucket,
    Key: itemType + "/" + id + "/" + dataType,
    ServerSideEncryption: "AES256"
  }, callback);
};

AwsS3StorageService.prototype._getKeyList = function(callback) {
  var self = this, listObjectParams = {Bucket: this._bucket};
  var keyList = [];
  
  getObjectList();
  
  function getObjectList() {
    self._s3.listObjectsV2(listObjectParams, function (err, result) {
      if (err) {
        callback(err);
        return;
      }
      
      for (var i = 0; i < result.Contents.length; i++) {
        keyList.push(result.Contents[i].Key);
      }
      
      if (result.IsTruncated) {
        listObjectParams.ContinuationToken = result.NextContinuationToken;
        process.nextTick(getObjectList);
      } else {
        callback(null, keyList);
      }
    });
  }
  
};

AwsS3StorageService.prototype.erase = function(callback) {
  var self = this;
  
  this._getKeyList(function(err, keyList) {
    if (err) {
      callback(err);
      return;
    }
    
    deleteItems(keyList)
  });
  
  function deleteItems(keyList) {
    var params = {
      Bucket: self._bucket,
      Delete: {
        Objects: []
      }
    };
  
    while (keyList.length && params.Delete.Objects.length < 1000) {
      params.Delete.Objects.push({Key: keyList.pop()});
    }
  
    if (params.Delete.Objects.length) {
      self._s3.deleteObjects(params, function(err) {
        if (err) {
          callback(err);
          return;
        }
        deleteItems(keyList);
      });
    } else {
      callback();
    }
  }
  
};

exports.create = function(options) {
  return new AwsS3StorageService(options);
};

