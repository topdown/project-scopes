# Testing Project Scopes Extension

## Quick Test Setup

To test the Project Scopes extension, follow these steps:

### 1. Create a Test Project Structure

Create a sample project with the following structure:

```
test-project/
├── src/
│   ├── components/
│   │   ├── Header.js
│   │   └── Footer.js
│   ├── pages/
│   │   ├── Home.js
│   │   └── About.js
│   ├── api/
│   │   ├── users.js
│   │   └── auth.js
│   └── utils/
│       ├── helpers.js
│       └── constants.js
├── tests/
│   ├── unit/
│   │   └── components.test.js
│   └── integration/
│       └── api.test.js
├── docs/
│   ├── README.md
│   └── API.md
└── config/
    ├── webpack.config.js
    └── babel.config.js
```

### 2. Install and Run Extension

1. Open VS Code in the extension folder (`project-scopes`)
2. Press `F5` to launch a new VS Code window with the extension
3. Open the test project folder in the new window
4. Look for the "Project Scopes" panel in the Explorer sidebar

### 3. Test Scope Creation

1. **Create Frontend Scope:**

   - Command Palette: `Create New Scope`
   - Name: "Frontend"
   - Select folders: `src/components`, `src/pages`

2. **Create Backend Scope:**

   - Command Palette: `Create New Scope`
   - Name: "Backend"
   - Select folders: `src/api`, `src/utils`

3. **Create Testing Scope:**
   - Command Palette: `Create New Scope`
   - Name: "Testing"
   - Select folders: `tests`

### 4. Test Scope Switching

1. **Via Status Bar:**

   - Click the scope indicator in the bottom-left status bar
   - Select different scopes to switch

2. **Via Command Palette:**

   - `Switch Scope` command
   - Select from the list

3. **Via Project Scopes Panel:**
   - Click on any scope in the Explorer sidebar panel

### 5. Test Scope Management

1. **Edit Scope:**

   - Right-click a scope in the Project Scopes panel
   - Choose "Edit Scope"
   - Test editing name, folders, and description

2. **Delete Scope:**
   - Right-click a scope in the Project Scopes panel
   - Choose "Delete Scope"
   - Confirm deletion

### 6. Test Settings Persistence

1. Create scopes and close VS Code
2. Reopen the project
3. Verify scopes are preserved and active scope is remembered

### Expected Behaviors

- ✅ Status bar shows active scope name
- ✅ Project Scopes panel shows all scopes with visual indicators
- ✅ Active scope is marked with ● (filled circle)
- ✅ Inactive scopes are marked with ○ (empty circle)
- ✅ Tooltips show folder information
- ✅ Settings are persisted in workspace configuration
- ✅ Commands work from Command Palette

### Sample Workspace Settings

After creating scopes, your `.vscode/settings.json` should look like:

```json
{
  "projectScopes.scopes": {
    "Frontend": {
      "folders": ["src/components", "src/pages"],
      "description": "UI components and pages",
      "created": "2024-01-01T12:00:00.000Z"
    },
    "Backend": {
      "folders": ["src/api", "src/utils"],
      "description": "API and utility functions",
      "created": "2024-01-01T12:05:00.000Z"
    },
    "Testing": {
      "folders": ["tests"],
      "description": "All test files",
      "created": "2024-01-01T12:10:00.000Z"
    }
  },
  "projectScopes.activeScope": "Frontend"
}
```
