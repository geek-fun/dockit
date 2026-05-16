import {
  mongoGlobalObjects,
  crudMethods,
  aggregationMethods,
  indexMethods,
  collectionManagementMethods,
  cursorMethods,
  aggregationStages,
  aggregationOperators,
  queryOperators,
  updateOperators,
  shellCommands,
  showSubcommands,
  jsKeywords,
  bsonTypes,
  sortValues,
  allCollectionMethods,
  mongoMethodCategories,
} from '../../../../src/common/monaco/mongodb/keywords';

describe('MongoDB Keywords', () => {
  describe('mongoGlobalObjects', () => {
    it('should contain db object', () => {
      expect(mongoGlobalObjects).toContain('db');
    });

    it('should contain use command', () => {
      expect(mongoGlobalObjects).toContain('use');
    });

    it('should contain show command', () => {
      expect(mongoGlobalObjects).toContain('show');
    });
  });

  describe('crudMethods', () => {
    it('should contain find methods', () => {
      expect(crudMethods).toContain('find');
      expect(crudMethods).toContain('findOne');
      expect(crudMethods).toContain('findOneAndDelete');
      expect(crudMethods).toContain('findOneAndReplace');
      expect(crudMethods).toContain('findOneAndUpdate');
    });

    it('should contain insert methods', () => {
      expect(crudMethods).toContain('insertOne');
      expect(crudMethods).toContain('insertMany');
    });

    it('should contain update methods', () => {
      expect(crudMethods).toContain('updateOne');
      expect(crudMethods).toContain('updateMany');
      expect(crudMethods).toContain('replaceOne');
    });

    it('should contain delete methods', () => {
      expect(crudMethods).toContain('deleteOne');
      expect(crudMethods).toContain('deleteMany');
    });

    it('should contain utility methods', () => {
      expect(crudMethods).toContain('bulkWrite');
      expect(crudMethods).toContain('countDocuments');
      expect(crudMethods).toContain('estimatedDocumentCount');
      expect(crudMethods).toContain('distinct');
    });
  });

  describe('aggregationMethods', () => {
    it('should contain aggregate method', () => {
      expect(aggregationMethods).toContain('aggregate');
    });

    it('should contain count method', () => {
      expect(aggregationMethods).toContain('count');
    });

    it('should contain group method', () => {
      expect(aggregationMethods).toContain('group');
    });

    it('should contain mapReduce method', () => {
      expect(aggregationMethods).toContain('mapReduce');
    });
  });

  describe('indexMethods', () => {
    it('should contain create index methods', () => {
      expect(indexMethods).toContain('createIndex');
      expect(indexMethods).toContain('createIndexes');
    });

    it('should contain drop index methods', () => {
      expect(indexMethods).toContain('dropIndex');
      expect(indexMethods).toContain('dropIndexes');
    });

    it('should contain get index methods', () => {
      expect(indexMethods).toContain('getIndexes');
      expect(indexMethods).toContain('getIndexSpecs');
      expect(indexMethods).toContain('getIndexKeys');
    });
  });

  describe('aggregationStages', () => {
    it('should contain match stage', () => {
      expect(aggregationStages).toContain('$match');
    });

    it('should contain group stage', () => {
      expect(aggregationStages).toContain('$group');
    });

    it('should contain sort stage', () => {
      expect(aggregationStages).toContain('$sort');
    });

    it('should contain limit stage', () => {
      expect(aggregationStages).toContain('$limit');
    });

    it('should contain project stage', () => {
      expect(aggregationStages).toContain('$project');
    });

    it('should contain lookup stage', () => {
      expect(aggregationStages).toContain('$lookup');
    });

    it('should contain unwind stage', () => {
      expect(aggregationStages).toContain('$unwind');
    });

    it('should contain all stages starting with $', () => {
      aggregationStages.forEach(stage => {
        expect(stage).toMatch(/^\$/);
      });
    });
  });

  describe('aggregationOperators', () => {
    it('should contain arithmetic operators', () => {
      expect(aggregationOperators).toContain('$add');
      expect(aggregationOperators).toContain('$subtract');
      expect(aggregationOperators).toContain('$multiply');
      expect(aggregationOperators).toContain('$divide');
    });

    it('should contain string operators', () => {
      expect(aggregationOperators).toContain('$concat');
      expect(aggregationOperators).toContain('$substr');
      expect(aggregationOperators).toContain('$toLower');
      expect(aggregationOperators).toContain('$toUpper');
    });

    it('should contain date operators', () => {
      expect(aggregationOperators).toContain('$year');
      expect(aggregationOperators).toContain('$month');
      expect(aggregationOperators).toContain('$dayOfMonth');
    });

    it('should contain comparison operators', () => {
      expect(aggregationOperators).toContain('$eq');
      expect(aggregationOperators).toContain('$ne');
      expect(aggregationOperators).toContain('$gt');
      expect(aggregationOperators).toContain('$gte');
      expect(aggregationOperators).toContain('$lt');
      expect(aggregationOperators).toContain('$lte');
    });
  });

  describe('queryOperators', () => {
    it('should contain comparison operators', () => {
      expect(queryOperators).toContain('$eq');
      expect(queryOperators).toContain('$gt');
      expect(queryOperators).toContain('$gte');
      expect(queryOperators).toContain('$lt');
      expect(queryOperators).toContain('$lte');
      expect(queryOperators).toContain('$ne');
    });

    it('should contain logical operators', () => {
      expect(queryOperators).toContain('$and');
      expect(queryOperators).toContain('$or');
      expect(queryOperators).toContain('$not');
      expect(queryOperators).toContain('$nor');
    });

    it('should contain element operators', () => {
      expect(queryOperators).toContain('$exists');
      expect(queryOperators).toContain('$type');
    });

    it('should contain array operators', () => {
      expect(queryOperators).toContain('$in');
      expect(queryOperators).toContain('$nin');
      expect(queryOperators).toContain('$all');
      expect(queryOperators).toContain('$elemMatch');
      expect(queryOperators).toContain('$size');
    });
  });

  describe('updateOperators', () => {
    it('should contain field update operators', () => {
      expect(updateOperators).toContain('$set');
      expect(updateOperators).toContain('$unset');
      expect(updateOperators).toContain('$inc');
      expect(updateOperators).toContain('$mul');
      expect(updateOperators).toContain('$rename');
    });

    it('should contain array update operators', () => {
      expect(updateOperators).toContain('$push');
      expect(updateOperators).toContain('$pull');
      expect(updateOperators).toContain('$addToSet');
      expect(updateOperators).toContain('$pop');
      expect(updateOperators).toContain('$pullAll');
    });

    it('should contain modifier operators', () => {
      expect(updateOperators).toContain('$each');
      expect(updateOperators).toContain('$position');
      expect(updateOperators).toContain('$slice');
      expect(updateOperators).toContain('$sort');
    });
  });

  describe('shellCommands', () => {
    it('should contain show command', () => {
      expect(shellCommands).toContain('show');
    });

    it('should contain use command', () => {
      expect(shellCommands).toContain('use');
    });

    it('should contain help command', () => {
      expect(shellCommands).toContain('help');
    });

    it('should contain exit commands', () => {
      expect(shellCommands).toContain('exit');
      expect(shellCommands).toContain('quit');
    });
  });

  describe('showSubcommands', () => {
    it('should contain database commands', () => {
      expect(showSubcommands).toContain('dbs');
      expect(showSubcommands).toContain('databases');
    });

    it('should contain collection commands', () => {
      expect(showSubcommands).toContain('collections');
      expect(showSubcommands).toContain('tables');
    });
  });

  describe('jsKeywords', () => {
    it('should contain control flow keywords', () => {
      expect(jsKeywords).toContain('if');
      expect(jsKeywords).toContain('else');
      expect(jsKeywords).toContain('for');
      expect(jsKeywords).toContain('while');
      expect(jsKeywords).toContain('switch');
      expect(jsKeywords).toContain('case');
    });

    it('should contain declaration keywords', () => {
      expect(jsKeywords).toContain('var');
      expect(jsKeywords).toContain('let');
      expect(jsKeywords).toContain('const');
      expect(jsKeywords).toContain('function');
    });

    it('should contain async/await', () => {
      expect(jsKeywords).toContain('async');
      expect(jsKeywords).toContain('await');
    });

    it('should contain literal values', () => {
      expect(jsKeywords).toContain('true');
      expect(jsKeywords).toContain('false');
      expect(jsKeywords).toContain('null');
      expect(jsKeywords).toContain('undefined');
    });
  });

  describe('bsonTypes', () => {
    it('should contain string type', () => {
      expect(bsonTypes).toContain('string');
    });

    it('should contain number types', () => {
      expect(bsonTypes).toContain('int');
      expect(bsonTypes).toContain('long');
      expect(bsonTypes).toContain('double');
      expect(bsonTypes).toContain('decimal');
    });

    it('should contain object/array types', () => {
      expect(bsonTypes).toContain('object');
      expect(bsonTypes).toContain('array');
    });

    it('should contain special types', () => {
      expect(bsonTypes).toContain('objectId');
      expect(bsonTypes).toContain('date');
      expect(bsonTypes).toContain('bool');
      expect(bsonTypes).toContain('null');
    });
  });

  describe('sortValues', () => {
    it('should contain ascending variants', () => {
      expect(sortValues).toContain('ascending');
      expect(sortValues).toContain('asc');
    });

    it('should contain descending variants', () => {
      expect(sortValues).toContain('descending');
      expect(sortValues).toContain('desc');
    });
  });

  describe('allCollectionMethods', () => {
    it('should include all CRUD methods', () => {
      crudMethods.forEach(method => {
        expect(allCollectionMethods).toContain(method);
      });
    });

    it('should include all aggregation methods', () => {
      aggregationMethods.forEach(method => {
        expect(allCollectionMethods).toContain(method);
      });
    });

    it('should include all index methods', () => {
      indexMethods.forEach(method => {
        expect(allCollectionMethods).toContain(method);
      });
    });

    it('should include all collection management methods', () => {
      collectionManagementMethods.forEach(method => {
        expect(allCollectionMethods).toContain(method);
      });
    });

    it('should include all cursor methods', () => {
      cursorMethods.forEach(method => {
        expect(allCollectionMethods).toContain(method);
      });
    });
  });

  describe('mongoMethodCategories', () => {
    it('should have crud category', () => {
      expect(mongoMethodCategories.crud).toEqual(crudMethods);
    });

    it('should have aggregation category', () => {
      expect(mongoMethodCategories.aggregation).toEqual(aggregationMethods);
    });

    it('should have index category', () => {
      expect(mongoMethodCategories.index).toEqual(indexMethods);
    });

    it('should have collection category', () => {
      expect(mongoMethodCategories.collection).toEqual(collectionManagementMethods);
    });

    it('should have cursor category', () => {
      expect(mongoMethodCategories.cursor).toEqual(cursorMethods);
    });
  });
});
