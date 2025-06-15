const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

/**
 * File System Provider for Project Scopes
 * This provider filters the file explorer to show only files/folders within the active scope
 */
class ScopeFileSystemProvider {
  constructor(scopeManager) {
    this.scopeManager = scopeManager;
    this._onDidChangeFile = new vscode.EventEmitter();
    this.onDidChangeFile = this._onDidChangeFile.event;

    // Watch for scope changes
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("projectScopes")) {
        this._onDidChangeFile.fire([]);
      }
    });
  }

  watch(uri, options) {
    // Create a file system watcher for the given URI
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(uri, "**/*"),
      options.excludeCreates,
      options.excludeChanges,
      options.excludeDeletes
    );

    return new vscode.Disposable(() => {
      watcher.dispose();
    });
  }

  stat(uri) {
    // Get file stats from the real file system
    return this._stat(uri.fsPath);
  }

  async _stat(fsPath) {
    try {
      const stats = await fs.promises.stat(fsPath);
      return {
        type: stats.isDirectory()
          ? vscode.FileType.Directory
          : vscode.FileType.File,
        ctime: stats.ctimeMs,
        mtime: stats.mtimeMs,
        size: stats.size,
      };
    } catch (error) {
      throw vscode.FileSystemError.FileNotFound(fsPath);
    }
  }

  readDirectory(uri) {
    return this._readDirectory(uri.fsPath);
  }

  async _readDirectory(fsPath) {
    try {
      const entries = await fs.promises.readdir(fsPath, {
        withFileTypes: true,
      });
      const result = [];

      const activeScope = this.scopeManager.getActiveScope();
      const scopes = this.scopeManager.getScopes();

      for (const entry of entries) {
        const entryPath = path.join(fsPath, entry.name);
        const relativePath = this.getRelativePath(entryPath);

        // Check if this entry should be visible based on the active scope
        if (this.shouldShowEntry(relativePath, activeScope, scopes)) {
          const type = entry.isDirectory()
            ? vscode.FileType.Directory
            : vscode.FileType.File;
          result.push([entry.name, type]);
        }
      }

      return result;
    } catch (error) {
      throw vscode.FileSystemError.FileNotFound(fsPath);
    }
  }

  shouldShowEntry(relativePath, activeScope, scopes) {
    // If no active scope, show everything
    if (!activeScope || !scopes[activeScope]) {
      return true;
    }

    const scopeFolders = scopes[activeScope].folders;

    // Check if this path is within any of the scope folders
    for (const folder of scopeFolders) {
      // Normalize paths for comparison
      const normalizedFolder = folder.replace(/\\/g, "/");
      const normalizedPath = relativePath.replace(/\\/g, "/");

      // Show if the path is the folder itself or a child of the folder
      if (
        normalizedPath === normalizedFolder ||
        normalizedPath.startsWith(normalizedFolder + "/")
      ) {
        return true;
      }

      // Show if the folder is a child of this path (parent directory)
      if (normalizedFolder.startsWith(normalizedPath + "/")) {
        return true;
      }
    }

    return false;
  }

  getRelativePath(absolutePath) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return absolutePath;
    }

    // Find the workspace folder that contains this path
    for (const workspaceFolder of workspaceFolders) {
      const workspacePath = workspaceFolder.uri.fsPath;
      if (absolutePath.startsWith(workspacePath)) {
        return path.relative(workspacePath, absolutePath);
      }
    }

    return absolutePath;
  }

  readFile(uri) {
    return this._readFile(uri.fsPath);
  }

  async _readFile(fsPath) {
    try {
      const data = await fs.promises.readFile(fsPath);
      return new Uint8Array(data);
    } catch (error) {
      throw vscode.FileSystemError.FileNotFound(fsPath);
    }
  }

  writeFile(uri, content, options) {
    return this._writeFile(uri.fsPath, content, options);
  }

  async _writeFile(fsPath, content, options) {
    const exists = await this._exists(fsPath);

    if (!exists && !options.create) {
      throw vscode.FileSystemError.FileNotFound(fsPath);
    }

    if (exists && options.create && !options.overwrite) {
      throw vscode.FileSystemError.FileExists(fsPath);
    }

    try {
      await fs.promises.writeFile(fsPath, content);
    } catch (error) {
      throw vscode.FileSystemError.NoPermissions(fsPath);
    }
  }

  async _exists(fsPath) {
    try {
      await fs.promises.access(fsPath);
      return true;
    } catch {
      return false;
    }
  }

  rename(oldUri, newUri, options) {
    return this._rename(oldUri.fsPath, newUri.fsPath, options);
  }

  async _rename(oldPath, newPath, options) {
    const exists = await this._exists(newPath);

    if (exists && !options.overwrite) {
      throw vscode.FileSystemError.FileExists(newPath);
    }

    try {
      await fs.promises.rename(oldPath, newPath);
    } catch (error) {
      throw vscode.FileSystemError.NoPermissions(oldPath);
    }
  }

  delete(uri, options) {
    return this._delete(uri.fsPath, options);
  }

  async _delete(fsPath, options) {
    if (options.recursive) {
      try {
        await fs.promises.rm(fsPath, { recursive: true, force: true });
      } catch (error) {
        throw vscode.FileSystemError.NoPermissions(fsPath);
      }
    } else {
      try {
        await fs.promises.unlink(fsPath);
      } catch (error) {
        throw vscode.FileSystemError.NoPermissions(fsPath);
      }
    }
  }

  createDirectory(uri) {
    return this._createDirectory(uri.fsPath);
  }

  async _createDirectory(fsPath) {
    try {
      await fs.promises.mkdir(fsPath, { recursive: true });
    } catch (error) {
      throw vscode.FileSystemError.NoPermissions(fsPath);
    }
  }
}

module.exports = { ScopeFileSystemProvider };
