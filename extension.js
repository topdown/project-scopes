// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const { ScopeFileSystemProvider } = require("./scopeFileSystemProvider");

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log("Project Scopes extension activated");

  // Check if workspace is available
  if (
    !vscode.workspace.workspaceFolders ||
    vscode.workspace.workspaceFolders.length === 0
  ) {
    console.log(
      "No workspace folders found - Project Scopes will be available when a workspace is opened"
    );
    return;
  }

  // Initialize scope manager
  console.log("Initializing ScopeManager...");
  const scopeManager = new ScopeManager(context);

  // Initialize tree data provider
  console.log("Registering projectScopes TreeDataProvider...");
  const treeDataProvider = new ScopeTreeDataProvider(scopeManager);
  vscode.window.registerTreeDataProvider("projectScopes", treeDataProvider);

  // Initialize scoped file explorer
  console.log("Registering scopedFileExplorer TreeDataProvider...");
  const fileExplorerProvider = new FileExplorerTreeDataProvider(scopeManager);
  vscode.window.registerTreeDataProvider(
    "scopedFileExplorer",
    fileExplorerProvider
  );

  // Register commands
  console.log("Registering commands...");
  const commands = [
    vscode.commands.registerCommand("project-scopes.createScope", () => {
      console.log("createScope command called");
      return scopeManager.createScope();
    }),
    vscode.commands.registerCommand("project-scopes.editScope", (item) => {
      console.log("editScope command called", item);
      const scopeName = item ? item.label.replace(/^[●○] /, "") : undefined;
      return scopeManager.editScope(scopeName);
    }),
    vscode.commands.registerCommand("project-scopes.deleteScope", (item) => {
      console.log("deleteScope command called", item);
      const scopeName = item ? item.label.replace(/^[●○] /, "") : undefined;
      return scopeManager.deleteScope(scopeName);
    }),
    vscode.commands.registerCommand("project-scopes.switchScope", () => {
      console.log("switchScope command called");
      return scopeManager.switchScope();
    }),
    vscode.commands.registerCommand("project-scopes.clearScope", () => {
      console.log("clearScope command called");
      return scopeManager.clearActiveScope();
    }),
    vscode.commands.registerCommand("project-scopes.refreshScopes", () => {
      console.log("refreshScopes command called");
      return treeDataProvider.refresh();
    }),
    vscode.commands.registerCommand("project-scopes.debugScope", () => {
      console.log("debugScope command called");
      return scopeManager.debugCurrentScope();
    }),
  ];

  // Add all commands to subscriptions
  commands.forEach((command) => context.subscriptions.push(command));

  console.log("Project Scopes extension setup complete!");
  vscode.window.showInformationMessage("Project Scopes extension is ready!");
}

// This method is called when your extension is deactivated
function deactivate() {
  console.log("Project Scopes extension deactivated");
}

module.exports = {
  activate,
  deactivate,
};

class ScopeManager {
  constructor(context) {
    console.log("ScopeManager constructor called");
    this.context = context;
    this.scopes = {};
    this.activeScope = null;
    this.statusBarItem = null;

    // Event emitter for scope changes
    this._onScopeChanged = new vscode.EventEmitter();
    this.onScopeChanged = this._onScopeChanged.event;

    console.log("Loading scopes...");
    this.loadScopes();
    console.log("Creating status bar item...");
    this.createStatusBarItem();
    console.log("ScopeManager initialization complete");
  }

  createStatusBarItem() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.statusBarItem.command = "project-scopes.switchScope";
    this.updateStatusBar();
    this.statusBarItem.show();
    this.context.subscriptions.push(this.statusBarItem);
  }

  loadScopes() {
    const config = vscode.workspace.getConfiguration("projectScopes");
    this.scopes = config.get("scopes", {});
    this.activeScope = config.get("activeScope", null);
    this.updateStatusBar();
  }

  async saveScopes() {
    const config = vscode.workspace.getConfiguration("projectScopes");
    await config.update(
      "scopes",
      this.scopes,
      vscode.ConfigurationTarget.Workspace
    );
    await config.update(
      "activeScope",
      this.activeScope,
      vscode.ConfigurationTarget.Workspace
    );
  }

  updateStatusBar() {
    if (this.activeScope && this.scopes[this.activeScope]) {
      this.statusBarItem.text = `$(folder) ${this.activeScope}`;
      this.statusBarItem.tooltip = `Active scope: ${
        this.activeScope
      }\nFolders: ${this.scopes[this.activeScope].folders.join(", ")}`;
    } else {
      this.statusBarItem.text = "$(folder) No Scope";
      this.statusBarItem.tooltip = "No active scope - showing all folders";
    }
  }

  async createScope() {
    const scopeName = await vscode.window.showInputBox({
      prompt: "Enter scope name",
      placeHolder: "e.g., Frontend, Backend, Tests",
      validateInput: (value) => {
        if (!value.trim()) return "Scope name cannot be empty";
        if (this.scopes[value]) return "Scope name already exists";
        return null;
      },
    });

    if (!scopeName) return;

    const folders = await this.selectFolders();
    if (!folders || folders.length === 0) return;

    this.scopes[scopeName] = {
      folders: folders,
      created: new Date().toISOString(),
      description: "",
    };

    await this.saveScopes();
    vscode.window.showInformationMessage(
      `Scope "${scopeName}" created successfully!`
    );

    // Ask if user wants to activate this scope
    const activate = await vscode.window.showQuickPick(["Yes", "No"], {
      placeHolder: "Activate this scope now?",
    });

    if (activate === "Yes") {
      await this.setActiveScope(scopeName);
    }
  }

  async editScope(scopeName) {
    if (!scopeName) {
      const scopes = Object.keys(this.scopes);
      if (scopes.length === 0) {
        vscode.window.showWarningMessage("No scopes defined");
        return;
      }

      scopeName = await vscode.window.showQuickPick(scopes, {
        placeHolder: "Select scope to edit",
      });
    }

    if (!scopeName || !this.scopes[scopeName]) return;

    const action = await vscode.window.showQuickPick(
      ["Edit Name", "Edit Folders", "Edit Description"],
      { placeHolder: "What would you like to edit?" }
    );

    if (!action) return;

    switch (action) {
      case "Edit Name":
        await this.editScopeName(scopeName);
        break;
      case "Edit Folders":
        await this.editScopeFolders(scopeName);
        break;
      case "Edit Description":
        await this.editScopeDescription(scopeName);
        break;
    }
  }

  async editScopeName(oldName) {
    const newName = await vscode.window.showInputBox({
      prompt: "Enter new scope name",
      value: oldName,
      validateInput: (value) => {
        if (!value.trim()) return "Scope name cannot be empty";
        if (value !== oldName && this.scopes[value])
          return "Scope name already exists";
        return null;
      },
    });

    if (!newName || newName === oldName) return;

    this.scopes[newName] = { ...this.scopes[oldName] };
    delete this.scopes[oldName];

    // Update active scope if it was the renamed one
    if (this.activeScope === oldName) {
      this.activeScope = newName;
    }

    await this.saveScopes();
    this._onScopeChanged.fire();
    vscode.window.showInformationMessage(
      `Scope renamed from "${oldName}" to "${newName}"`
    );
  }

  async editScopeFolders(scopeName) {
    const folders = await this.selectFolders(this.scopes[scopeName].folders);
    if (!folders) return;

    this.scopes[scopeName] = {
      ...this.scopes[scopeName],
      folders: folders,
    };

    await this.saveScopes();
    this._onScopeChanged.fire();
    vscode.window.showInformationMessage(
      `Folders updated for scope "${scopeName}"`
    );
  }

  async editScopeDescription(scopeName) {
    const description = await vscode.window.showInputBox({
      prompt: "Enter scope description",
      value: this.scopes[scopeName].description || "",
      placeHolder: "Optional description for this scope",
    });

    if (description === undefined) return;

    this.scopes[scopeName] = {
      ...this.scopes[scopeName],
      description: description,
    };

    await this.saveScopes();
    vscode.window.showInformationMessage(
      `Description updated for scope "${scopeName}"`
    );
  }

  async deleteScope(scopeName) {
    if (!scopeName) {
      const scopes = Object.keys(this.scopes);
      if (scopes.length === 0) {
        vscode.window.showWarningMessage("No scopes defined");
        return;
      }

      scopeName = await vscode.window.showQuickPick(scopes, {
        placeHolder: "Select scope to delete",
      });
    }

    if (!scopeName || !this.scopes[scopeName]) return;

    const confirmation = await vscode.window.showWarningMessage(
      `Are you sure you want to delete scope "${scopeName}"?`,
      "Delete",
      "Cancel"
    );

    if (confirmation !== "Delete") return;

    delete this.scopes[scopeName];

    // Clear active scope if it was the deleted one
    if (this.activeScope === scopeName) {
      this.activeScope = null;
    }

    await this.saveScopes();
    this._onScopeChanged.fire();
    vscode.window.showInformationMessage(`Scope "${scopeName}" deleted`);
  }

  async switchScope() {
    const scopes = Object.keys(this.scopes);
    if (scopes.length === 0) {
      vscode.window.showWarningMessage(
        "No scopes defined. Create a scope first."
      );
      return;
    }

    const items = [
      {
        label: "$(clear-all) Clear Active Scope",
        description: "Show all folders",
        scopeName: null,
      },
      ...scopes.map((scopeName) => ({
        label: `$(folder) ${scopeName}`,
        description:
          this.scopes[scopeName].description ||
          `Folders: ${this.scopes[scopeName].folders.join(", ")}`,
        scopeName: scopeName,
      })),
    ];

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Select a scope to activate",
    });

    if (selected === undefined) return;

    if (selected.scopeName) {
      await this.setActiveScope(selected.scopeName);
    } else {
      await this.clearActiveScope();
    }
  }

  async setActiveScope(scopeName) {
    if (!this.scopes[scopeName]) {
      vscode.window.showErrorMessage(`Scope "${scopeName}" not found`);
      return;
    }

    this.activeScope = scopeName;
    await this.saveScopes();
    this.updateStatusBar();
    this._onScopeChanged.fire();

    console.log(`Activated scope: ${scopeName}`);
    vscode.window.showInformationMessage(`Activated scope: ${scopeName}`);
  }

  async clearActiveScope() {
    if (!this.activeScope) {
      vscode.window.showInformationMessage("No active scope to clear");
      return;
    }

    const previousScope = this.activeScope;
    this.activeScope = null;
    await this.saveScopes();
    this.updateStatusBar();
    this._onScopeChanged.fire();

    console.log(`Cleared scope: ${previousScope}`);
    vscode.window.showInformationMessage(`Cleared scope: ${previousScope}`);
  }

  async selectFolders(currentFolders = []) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage("No workspace folders found");
      return null;
    }

    // Get all directories in the workspace
    const allFolders = await this.getAllWorkspaceFolders();

    const items = allFolders.map((folder) => ({
      label: folder,
      description: "",
      picked: currentFolders.includes(folder),
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Select folders to include in this scope",
      canPickMany: true,
    });

    if (!selected) return null;

    return selected.map((item) => item.label);
  }

  async getAllWorkspaceFolders() {
    const folders = [];
    const workspaceFolders = vscode.workspace.workspaceFolders;

    for (const workspaceFolder of workspaceFolders) {
      const relativeFolders = await this.getDirectoriesRecursive(
        workspaceFolder.uri.fsPath,
        workspaceFolder.uri.fsPath
      );
      folders.push(...relativeFolders);
    }

    return [...new Set(folders)].sort();
  }

  async getDirectoriesRecursive(
    dirPath,
    workspaceRoot,
    maxDepth = 3,
    currentDepth = 0
  ) {
    const folders = [];

    if (currentDepth >= maxDepth) return folders;

    try {
      const items = await fs.promises.readdir(dirPath, { withFileTypes: true });

      for (const item of items) {
        if (
          item.isDirectory() &&
          !item.name.startsWith(".") &&
          item.name !== "node_modules"
        ) {
          const fullPath = path.join(dirPath, item.name);
          const relativePath = path.relative(workspaceRoot, fullPath);
          folders.push(relativePath);

          // Recursively get subdirectories
          const subFolders = await this.getDirectoriesRecursive(
            fullPath,
            workspaceRoot,
            maxDepth,
            currentDepth + 1
          );
          folders.push(...subFolders);
        }
      }
    } catch (error) {
      // Ignore errors (permission issues, etc.)
    }

    return folders;
  }

  getScopes() {
    return this.scopes;
  }

  getActiveScope() {
    return this.activeScope;
  }

  async debugCurrentScope() {
    console.log("=== DEBUG SCOPE INFO ===");
    console.log("Active scope:", this.activeScope);
    console.log("All scopes:", this.scopes);
    console.log("=== END DEBUG ===");
  }
}

class ScopeTreeDataProvider {
  constructor(scopeManager) {
    this.scopeManager = scopeManager;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;

    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("projectScopes")) {
        this.refresh();
      }
    });
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    if (!element) {
      // Root level - return all scopes
      const scopes = this.scopeManager.getScopes();
      const activeScope = this.scopeManager.getActiveScope();

      return Object.keys(scopes).map((scopeName) => {
        const scope = scopes[scopeName];
        const isActive = scopeName === activeScope;

        const item = new vscode.TreeItem(
          `${isActive ? "● " : "○ "}${scopeName}`,
          vscode.TreeItemCollapsibleState.Collapsed
        );

        item.contextValue = "scope";
        item.description =
          scope.description || `${scope.folders.length} folders`;
        item.tooltip = `${scope.folders.join(", ")}\n${
          isActive ? "(Active)" : "(Inactive)"
        }`;
        item.iconPath = new vscode.ThemeIcon(
          isActive ? "folder-active" : "folder"
        );

        return item;
      });
    } else {
      // Show folders for this scope
      const scopeName = element.label.replace(/^[●○] /, "");
      const scopes = this.scopeManager.getScopes();
      const scope = scopes[scopeName];

      if (scope) {
        return scope.folders.map((folder) => {
          const item = new vscode.TreeItem(
            folder,
            vscode.TreeItemCollapsibleState.None
          );
          item.contextValue = "folder";
          item.iconPath = new vscode.ThemeIcon("folder");
          return item;
        });
      }

      return [];
    }
  }
}

class FileExplorerTreeDataProvider {
  constructor(scopeManager) {
    this.scopeManager = scopeManager;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;

    // Listen for scope changes
    this.scopeManager.onScopeChanged(() => {
      this.refresh();
    });
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    const isDirectory = element.type === vscode.FileType.Directory;
    const collapsibleState = isDirectory
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None;

    const item = new vscode.TreeItem(element.name, collapsibleState);
    item.resourceUri = element.uri;
    item.contextValue = isDirectory ? "folder" : "file";
    item.command = isDirectory
      ? undefined
      : {
          command: "vscode.open",
          title: "Open File",
          arguments: [element.uri],
        };

    // Set appropriate icons
    if (isDirectory) {
      item.iconPath = new vscode.ThemeIcon("folder");
    } else {
      item.iconPath = new vscode.ThemeIcon("file");
    }

    return item;
  }

  async getChildren(element) {
    const activeScope = this.scopeManager.getActiveScope();
    const scopes = this.scopeManager.getScopes();

    // If no active scope, return empty (or could return all files)
    if (!activeScope || !scopes[activeScope]) {
      return [];
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return [];
    }

    if (!element) {
      // Root level - return scoped folders
      const scopeFolders = scopes[activeScope].folders;
      const rootItems = [];

      for (const scopeFolder of scopeFolders) {
        for (const workspaceFolder of workspaceFolders) {
          const scopePath = path.resolve(
            workspaceFolder.uri.fsPath,
            scopeFolder
          );
          try {
            const stat = await fs.promises.stat(scopePath);
            if (stat.isDirectory()) {
              const uri = vscode.Uri.file(scopePath);
              rootItems.push({
                name: path.basename(scopeFolder),
                uri: uri,
                type: vscode.FileType.Directory,
              });
            }
          } catch (error) {
            // Scope folder doesn't exist, skip it
          }
        }
      }

      return rootItems;
    } else {
      // Get children of the given directory
      try {
        const entries = await fs.promises.readdir(element.uri.fsPath, {
          withFileTypes: true,
        });
        const children = [];

        for (const entry of entries) {
          // Skip hidden files and common ignore patterns
          if (entry.name.startsWith(".") || entry.name === "node_modules") {
            continue;
          }

          const childPath = path.join(element.uri.fsPath, entry.name);
          const childUri = vscode.Uri.file(childPath);
          const fileType = entry.isDirectory()
            ? vscode.FileType.Directory
            : vscode.FileType.File;

          children.push({
            name: entry.name,
            uri: childUri,
            type: fileType,
          });
        }

        // Sort: directories first, then files, both alphabetically
        children.sort((a, b) => {
          if (a.type === b.type) {
            return a.name.localeCompare(b.name);
          }
          return a.type === vscode.FileType.Directory ? -1 : 1;
        });

        return children;
      } catch (error) {
        console.error("Error reading directory:", error);
        return [];
      }
    }
  }
}
