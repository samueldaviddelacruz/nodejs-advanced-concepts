const mongoose = require("mongoose");
const redis = require("redis");
const util = require("util");
const keys = require("../config/keys");

const client = redis.createClient(keys.redisUrl);
client.hget = util.promisify(client.hget);
const exec = mongoose.Query.prototype.exec;

mongoose.Query.prototype.cache = async function(options={}) {
  this.useCache = true;
  this.hashKey = JSON.stringify(options.key || '');
  return this;
};

mongoose.Query.prototype.exec = async function() {
  if (!this.useCache) {
    return exec.apply(this, arguments);
  }
  const key = JSON.stringify(
    Object.assign({}, this.getQuery(), {
      collection: this.mongooseCollection.name
    })
  );

  const cacheValue = await client.hget(this.hashKey,key);

  if (cacheValue) {
    const doc = JSON.parse(cacheValue);
    /*
      this.model refers to the Class of the corresponding Mongoose Model of the query being executed, example: User,Blog
      this function must return a Promise of Mongoose model objects due to the nature of the mongoose model object having other
      functions attached once is created ( validate,set,get etc)
    */
    return Array.isArray(doc)
      ? doc.map(d => new this.model(d))
      : new this.model(doc);
  }

  //await the results of the query once executed, with any arguments that were passed on.
  const result = await exec.apply(this, arguments);

  client.hset(this.hashKey,key, JSON.stringify(result));

  return result;
};


module.exports = {
    clearHash(hashKey){
        client.del(JSON.stringify(hashKey) )
    }
}