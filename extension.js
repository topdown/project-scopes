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
  const scopeManager = new ScopeManager(context);

  // Initialize tree data provider
  const treeDataProvider = new ScopeTreeDataProvider(scopeManager);
  vscode.window.registerTreeDataProvider("projectScopes", treeDataProvider);

  // Register commands
  const commands = [
    vscode.commands.registerCommand("project-scopes.createScope", () =>
      scopeManager.createScope()
    ),
    vscode.commands.registerCommand("project-scopes.editScope", (item) => {
      const scopeName = item ? item.label.replace(/^[●○] /, "") : undefined;
      scopeManager.editScope(scopeName);
    }),
    vscode.commands.registerCommand("project-scopes.deleteScope", (item) => {
      const scopeName = item ? item.label.replace(/^[●○] /, "") : undefined;
      scopeManager.deleteScope(scopeName);
    }),
    vscode.commands.registerCommand("project-scopes.switchScope", () =>
      scopeManager.switchScope()
    ),
    vscode.commands.registerCommand("project-scopes.clearScope", () =>
      scopeManager.clearActiveScope()
    ),
    vscode.commands.registerCommand("project-scopes.refreshScopes", () =>
      treeDataProvider.refresh()
    ),
    vscode.commands.registerCommand("project-scopes.debugScope", () =>
      scopeManager.debugCurrentScope()
    ),
  ];

  // Add all commands to subscriptions
  commands.forEach((command) => context.subscriptions.push(command));

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
    this.context = context;
    this.workspaceConfig = vscode.workspace.getConfiguration("projectScopes");
    this.activeScope = this.workspaceConfig.get("activeScope", "");
    this.scopes = this.workspaceConfig.get("scopes", {});
    this.statusBarItem = null;
    this.originalWorkspaceFolders = null;
    this.originalExcludeSettings = null;

    // Initialize status bar
    this.initializeStatusBar();

    // Initialize file system watcher
    this.initializeFileSystemWatcher();

    // Register configuration change listener
    vscode.workspace.onDidChangeConfiguration(
      this.onConfigurationChanged.bind(this)
    );
  }

  initializeStatusBar() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.statusBarItem.command = "project-scopes.switchScope";
    this.updateStatusBar();
    this.statusBarItem.show();
    this.context.subscriptions.push(this.statusBarItem);
  }

  initializeFileSystemWatcher() {
    // Watch for file system changes to refresh scope validity
    const watcher = vscode.workspace.createFileSystemWatcher("**/*");
    watcher.onDidCreate(() => this.validateScopes());
    watcher.onDidDelete(() => this.validateScopes());
    this.context.subscriptions.push(watcher);
  }

  onConfigurationChanged(event) {
    if (event.affectsConfiguration("projectScopes")) {
      this.workspaceConfig = vscode.workspace.getConfiguration("projectScopes");
      this.activeScope = this.workspaceConfig.get("activeScope", "");
      this.scopes = this.workspaceConfig.get("scopes", {});
      this.updateStatusBar();
      this.updateFileExplorerVisibility();
    }
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

    const newScopes = { ...this.scopes };
    newScopes[scopeName] = {
      folders: folders,
      created: new Date().toISOString(),
      description: "",
    };

    await this.workspaceConfig.update(
      "scopes",
      newScopes,
      vscode.ConfigurationTarget.Workspace
    );

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
      {
        placeHolder: "What would you like to edit?",
      }
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

    const newScopes = { ...this.scopes };
    newScopes[newName] = { ...newScopes[oldName] };
    delete newScopes[oldName];

    await this.workspaceConfig.update(
      "scopes",
      newScopes,
      vscode.ConfigurationTarget.Workspace
    );

    // Update active scope if it was the renamed one
    if (this.activeScope === oldName) {
      await this.workspaceConfig.update(
        "activeScope",
        newName,
        vscode.ConfigurationTarget.Workspace
      );
    }

    vscode.window.showInformationMessage(
      `Scope renamed from "${oldName}" to "${newName}"`
    );
  }

  async editScopeFolders(scopeName) {
    const folders = await this.selectFolders(this.scopes[scopeName].folders);
    if (!folders) return;

    const newScopes = { ...this.scopes };
    newScopes[scopeName] = {
      ...newScopes[scopeName],
      folders: folders,
    };

    await this.workspaceConfig.update(
      "scopes",
      newScopes,
      vscode.ConfigurationTarget.Workspace
    );
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

    const newScopes = { ...this.scopes };
    newScopes[scopeName] = {
      ...newScopes[scopeName],
      description: description,
    };

    await this.workspaceConfig.update(
      "scopes",
      newScopes,
      vscode.ConfigurationTarget.Workspace
    );
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

    const newScopes = { ...this.scopes };
    delete newScopes[scopeName];

    await this.workspaceConfig.update(
      "scopes",
      newScopes,
      vscode.ConfigurationTarget.Workspace
    );

    // Clear active scope if it was the deleted one
    if (this.activeScope === scopeName) {
      await this.workspaceConfig.update(
        "activeScope",
        "",
        vscode.ConfigurationTarget.Workspace
      );
    }

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
        scopeName: "",
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

    await this.setActiveScope(selected.scopeName);
  }

  async setActiveScope(scopeName) {
    await this.workspaceConfig.update(
      "activeScope",
      scopeName,
      vscode.ConfigurationTarget.Workspace
    );

    if (scopeName) {
      vscode.window.showInformationMessage(`Activated scope: ${scopeName}`);
    } else {
      vscode.window.showInformationMessage(
        "Cleared active scope - showing all folders"
      );
    }

    this.updateFileExplorerVisibility();
  }

  async clearActiveScope() {
    await this.setActiveScope("");
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

  async updateFileExplorerVisibility() {
    if (this.activeScope && this.scopes[this.activeScope]) {
      // Active scope - apply file exclusion filter
      await this.applyScopeFilter();
    } else {
      // No active scope - remove filters
      await this.clearScopeFilter();
    }
  }

  async applyScopeFilter() {
    const scopeFolders = this.scopes[this.activeScope].folders;
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || scopeFolders.length === 0) return;

    // Store original files.exclude setting if not already stored
    if (!this.originalExcludeSettings) {
      const filesConfig = vscode.workspace.getConfiguration("files");
      this.originalExcludeSettings = filesConfig.get("exclude", {});
      console.log(
        "Stored original exclude settings:",
        this.originalExcludeSettings
      );
    }

    // Build exclusion patterns
    const excludePatterns = { ...this.originalExcludeSettings };

    // For each workspace folder, exclude everything except scoped paths
    for (const workspaceFolder of workspaceFolders) {
      const workspaceRelativePath = path.relative(
        vscode.workspace.workspaceFolders[0].uri.fsPath,
        workspaceFolder.uri.fsPath
      );
      const basePath = workspaceRelativePath || "";

      // Get all immediate children of the workspace folder
      try {
        const workspacePath = workspaceFolder.uri.fsPath;
        const entries = await fs.promises.readdir(workspacePath, {
          withFileTypes: true,
        });

        for (const entry of entries) {
          const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name;

          // Check if this entry should be visible (is in scope or contains scope)
          let shouldShow = false;

          for (const scopeFolder of scopeFolders) {
            // Normalize paths for comparison
            const normalizedScope = scopeFolder.replace(/\\/g, "/");
            const normalizedEntry = entryPath.replace(/\\/g, "/");

            // Show if entry is exactly the scoped folder
            if (normalizedEntry === normalizedScope) {
              shouldShow = true;
              break;
            }

            // Show if entry is a parent of the scoped folder
            if (normalizedScope.startsWith(normalizedEntry + "/")) {
              shouldShow = true;
              break;
            }
          }

          // If this entry should not be shown, exclude it
          if (!shouldShow) {
            excludePatterns[entryPath] = true;
            // Also exclude with ** pattern for nested exclusion
            excludePatterns[`${entryPath}/**`] = true;
          }
        }
      } catch (error) {
        console.error(
          `Error reading workspace folder ${workspaceFolder.uri.fsPath}:`,
          error
        );
      }
    }

    // Apply the exclusion patterns
    const filesConfig = vscode.workspace.getConfiguration("files");
    await filesConfig.update(
      "exclude",
      excludePatterns,
      vscode.ConfigurationTarget.Workspace
    );

    console.log(`Applied scope filter for "${this.activeScope}"`);
    console.log("Exclude patterns:", excludePatterns);

    vscode.window.showInformationMessage(
      `Scope "${this.activeScope}" active - showing only: ${scopeFolders.join(
        ", "
      )}`
    );
  }

  async clearScopeFilter() {
    if (!this.originalExcludeSettings) {
      console.log("No original exclude settings to restore");
      return;
    }

    // Restore original files.exclude settings
    const filesConfig = vscode.workspace.getConfiguration("files");
    await filesConfig.update(
      "exclude",
      this.originalExcludeSettings,
      vscode.ConfigurationTarget.Workspace
    );

    console.log("Restored original exclude settings");
    this.originalExcludeSettings = null; // Reset for next time

    vscode.window.showInformationMessage("Scope cleared - showing all folders");
  }

  async applyScopeWorkspace() {
    const scopeFolders = this.scopes[this.activeScope].folders;
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || scopeFolders.length === 0) return;

    // Store original workspace folders if not already stored
    if (!this.originalWorkspaceFolders) {
      this.originalWorkspaceFolders = workspaceFolders.map((folder) => ({
        uri: folder.uri,
        name: folder.name,
      }));
      console.log(
        "Stored original workspace folders:",
        this.originalWorkspaceFolders
      );
    }

    // Build new workspace folders from scoped paths
    const scopedWorkspaceFolders = [];

    for (const workspaceFolder of workspaceFolders) {
      for (const scopeFolder of scopeFolders) {
        const scopedPath = path.join(workspaceFolder.uri.fsPath, scopeFolder);

        // Check if the scoped path exists
        if (await this.pathExists(scopedPath)) {
          const scopedUri = vscode.Uri.file(scopedPath);
          scopedWorkspaceFolders.push({
            uri: scopedUri,
            name: path.basename(scopeFolder) || scopeFolder,
          });
          console.log(`Adding scoped workspace folder: ${scopedPath}`);
        } else {
          console.log(`Scoped path does not exist: ${scopedPath}`);
        }
      }
    }

    if (scopedWorkspaceFolders.length === 0) {
      vscode.window.showWarningMessage(
        `No valid folders found for scope "${this.activeScope}"`
      );
      return;
    }

    // Replace workspace folders with scoped ones
    const success = vscode.workspace.updateWorkspaceFolders(
      0, // Start index
      workspaceFolders.length, // Delete count (remove all current)
      ...scopedWorkspaceFolders // Add scoped folders
    );

    if (success) {
      console.log(
        `Applied workspace scope: showing ${scopedWorkspaceFolders.length} folders`
      );
      vscode.window.showInformationMessage(
        `Scope "${this.activeScope}" active - showing only: ${scopeFolders.join(
          ", "
        )}`
      );
    } else {
      vscode.window.showErrorMessage("Failed to apply workspace scope");
    }
  }

  async restoreOriginalWorkspace() {
    if (!this.originalWorkspaceFolders) {
      console.log("No original workspace folders to restore");
      return;
    }

    const currentFolders = vscode.workspace.workspaceFolders || [];

    // Restore original workspace folders
    const success = vscode.workspace.updateWorkspaceFolders(
      0, // Start index
      currentFolders.length, // Delete count (remove all current)
      ...this.originalWorkspaceFolders // Restore originals
    );

    if (success) {
      console.log("Restored original workspace folders");
      vscode.window.showInformationMessage(
        "Scope cleared - showing all folders"
      );
      this.originalWorkspaceFolders = null; // Reset for next time
    } else {
      vscode.window.showErrorMessage("Failed to restore original workspace");
    }
  }

  async pathExists(filePath) {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  validateScopes() {
    // Check if all folders in scopes still exist
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    Object.keys(this.scopes).forEach((scopeName) => {
      const scope = this.scopes[scopeName];
      // This could be enhanced to validate folder existence
    });
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

    if (this.activeScope && this.scopes[this.activeScope]) {
      const scopeFolders = this.scopes[this.activeScope].folders;
      console.log("Scope folders:", scopeFolders);

      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders) {
        console.log("Current workspace folders:");
        for (const workspaceFolder of workspaceFolders) {
          console.log(
            `  ${workspaceFolder.name}: ${workspaceFolder.uri.fsPath}`
          );
        }

        console.log("Checking scoped paths:");
        for (const workspaceFolder of workspaceFolders) {
          for (const scopeFolder of scopeFolders) {
            const scopedPath = path.join(
              workspaceFolder.uri.fsPath,
              scopeFolder
            );
            const exists = await this.pathExists(scopedPath);
            console.log(`  ${scopedPath}: ${exists ? "EXISTS" : "NOT FOUND"}`);
          }
        }
      }

      // Show current exclude settings
      const filesConfig = vscode.workspace.getConfiguration("files");
      const currentExclude = filesConfig.get("exclude", {});
      console.log("Current files.exclude settings:", currentExclude);

      console.log(
        "Original exclude settings stored:",
        !!this.originalExcludeSettings
      );
      if (this.originalExcludeSettings) {
        console.log("Original exclude settings:", this.originalExcludeSettings);
      }
    }

    console.log("=== END DEBUG ===");

    // Manually trigger the filter update
    await this.updateFileExplorerVisibility();
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
