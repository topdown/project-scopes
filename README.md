# Project Scopes for VS Code

A VS Code extension that allows you to define and switch between different folder scopes within your project, similar to JetBrains IDEs.

## Features

- **Create Named Scopes**: Define custom scopes that include specific folders from your project
- **Quick Scope Switching**: Easily switch between different scopes using the command palette or status bar
- **Visual Indicators**: See which scope is currently active in the status bar and Project Scopes panel
- **Scope Management**: Edit scope names, descriptions, and folder selections
- **Persistent Settings**: Scopes are saved in your workspace settings

## Usage

### Creating a Scope

1. Open the Command Palette (`Cmd+Shift+P` on Mac, `Ctrl+Shift+P` on Windows/Linux)
2. Run the command `Create New Scope`
3. Enter a name for your scope (e.g., "Frontend", "Backend", "Tests")
4. Select the folders you want to include in this scope
5. Choose whether to activate the scope immediately

### Switching Scopes

**Method 1: Status Bar**

- Click on the scope indicator in the status bar (bottom-left)
- Select a scope from the dropdown

**Method 2: Command Palette**

- Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
- Run the command `Switch Scope`
- Select a scope from the list

**Method 3: Project Scopes Panel**

- In the Explorer sidebar, find the "Project Scopes" panel
- Click on any scope to activate it

### Managing Scopes

**Edit a Scope:**

- Right-click on a scope in the Project Scopes panel
- Choose "Edit Scope"
- Select what you want to edit (name, folders, or description)

**Delete a Scope:**

- Right-click on a scope in the Project Scopes panel
- Choose "Delete Scope"
- Confirm the deletion

**Clear Active Scope:**

- Click the status bar scope indicator and select "Clear Active Scope"
- Or use the Command Palette: `Clear Active Scope`

## Interface Elements

### Status Bar

Shows the currently active scope in the bottom-left corner. Click to quickly switch scopes.

### Project Scopes Panel

Located in the Explorer sidebar, this panel shows:

- All defined scopes with visual indicators (● for active, ○ for inactive)
- Folder count or description for each scope
- Expandable view showing folders included in each scope

### Commands

All commands are available through the Command Palette:

- `Create New Scope`
- `Switch Scope`
- `Clear Active Scope`
- `Edit Scope`
- `Delete Scope`

## Scope Configuration

Scopes are stored in your workspace settings under:

```json
{
  "projectScopes.scopes": {
    "Frontend": {
      "folders": ["src/components", "src/pages", "src/styles"],
      "description": "All frontend-related code",
      "created": "2024-01-01T12:00:00.000Z"
    },
    "Backend": {
      "folders": ["src/api", "src/models", "src/controllers"],
      "description": "Backend API and data layer",
      "created": "2024-01-01T12:00:00.000Z"
    }
  },
  "projectScopes.activeScope": "Frontend"
}
```

## Use Cases

- **Large Projects**: Focus on specific parts of large codebases
- **Feature Development**: Create scopes for specific features or modules
- **Team Collaboration**: Share scopes through workspace settings
- **Code Reviews**: Focus on relevant code sections during reviews
- **Learning**: Explore unfamiliar codebases by focusing on specific areas

## Installation & Development

1. Clone this repository
2. Run `npm install` to install dependencies
3. Press `F5` to launch a new VS Code window with the extension loaded
4. Open a project folder to start using Project Scopes

## Requirements

- VS Code version 1.101.0 or higher
- An open workspace/folder

## Known Limitations

- Currently supports folder-level scoping (not individual files)
- Maximum folder depth of 3 levels for performance
- Excludes hidden folders (starting with .) and `node_modules`

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

This project is licensed under the MIT License.
