/**
 * Compares two .gs files to find unique and overlapping functions.
 * Use this to resolve the naming conflict between API_TransactionLogic and APItransactionLogic.
 */
function auditTransactionFunctions() {
  const fileA = "API_TransactionLogic"; // The primary file
  const fileB = "APItransactionLogic"; // The duplicate/conflicting file
  
  const funcsA = getFunctionsFromFile(fileA);
  const funcsB = getFunctionsFromFile(fileB);
  
  const allFuncs = new Set([...funcsA, ...funcsB]);
  const uniqueToA = funcsA.filter(f => !funcsB.includes(f));
  const uniqueToB = funcsB.filter(f => !funcsA.includes(f));
  const overlaps = funcsA.filter(f => funcsB.includes(f));
  
  Logger.log(`--- ANALYSIS REPORT ---`);
  Logger.log(`Total Unique Functions Across Both: ${allFuncs.size}`);
  Logger.log(`Overlapping (Duplicates): ${overlaps.length} -> [${overlaps.join(', ')}]`);
  Logger.log(`Unique to ${fileA}: ${uniqueToA.length} -> [${uniqueToA.join(', ')}]`);
  Logger.log(`Unique to ${fileB}: ${uniqueToB.length} -> [${uniqueToB.join(', ')}]`);
  
  if (uniqueToB.length > 0) {
    Logger.log(`⚠️ WARNING: ${fileB} contains unique logic that must be migrated before deletion.`);
  } else {
    Logger.log(`✅ SAFE: ${fileB} contains no unique functions. It can be deleted.`);
  }
}

/**
 * Uses Regular Expressions to find function declarations in a file.
 */
function getFunctionsFromFile(fileName) {
  // This retrieves the content of the script file via the Apps Script API 
  // or by accessing the file if you have a catalog utility that reads script content.
  // If CodebaseCatalog.gs already has a 'getFileContent' method, use that here.
  const content = CodebaseCatalog.getFileContent(fileName); 
  
  if (!content) {
    throw new Error(`Could not find content for file: ${fileName}`);
  }
  
  // Regex looks for "function functionName("
  const regex = /function\s+([a-zA-Z0-9_]+)\s*\(/g;
  const functions = [];
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    functions.push(match[1]);
  }
  
  return functions;
}
