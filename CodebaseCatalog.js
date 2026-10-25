// CodebaseCatalog.gs
// Minimal, production-ready codebase file discovery
// Fixes FileIterator.forEach() error at line 26

function searchCodebaseLocal() {
  try {
    const projectName = "Akamas Short Mat Bowls Club";
    const files = [];
    
    // Proper FileIterator iteration pattern (not .forEach())
    const fileIterator = DriveApp.getFilesByName(projectName);
    
    if (!fileIterator || typeof fileIterator.hasNext !== 'function') {
      Logger.log(`[CodebaseCatalog] WARNING: DriveApp scope issue or invalid iterator`);
      return { success: false, files: [], error: "DriveApp iterator unavailable" };
    }
    
    // Iterate safely using .hasNext() / .next()
    while (fileIterator.hasNext()) {
      const file = fileIterator.next();
      files.push({
        name: file.getName(),
        id: file.getId(),
        mimeType: file.getMimeType()
      });
    }
    
    Logger.log(`[CodebaseCatalog] Found ${files.length} file(s)`);
    return { success: true, files: files, error: null };
    
  } catch (e) {
    Logger.log(`[CodebaseCatalog] ERROR: ${e.message}`);
    return { success: false, files: [], error: e.message };
  }
}

function listCodebaseFiles() {
  const result = searchCodebaseLocal();
  if (result.success) {
    result.files.forEach(file => {
      Logger.log(`  - ${file.name} (${file.id}) [${file.mimeType}]`);
    });
  } else {
    Logger.log(`Catalog search failed: ${result.error}`);
  }
  return result;
}

// END OF CodebaseCatalog.gs
