const db = require('./index');

/**
 * Initialize the projects table
 * This should be called on app startup
 */
function initProjectsTable() {
    // Create projects table
    db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT '#818cf8',
            icon TEXT DEFAULT '📁',
            view_mode TEXT NOT NULL DEFAULT 'list',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    const projectInfo = db.prepare("PRAGMA table_info(projects)").all();
    const hasViewMode = projectInfo.some(col => col.name === 'view_mode');
    if (!hasViewMode) {
        db.exec(`ALTER TABLE projects ADD COLUMN view_mode TEXT NOT NULL DEFAULT 'list'`);
        console.log('✅ Added view_mode column to projects table');
    }

    // Add project_id to tasks table if it doesn't exist
    const tableInfo = db.prepare("PRAGMA table_info(tasks)").all();
    const hasProjectId = tableInfo.some(col => col.name === 'project_id');

    if (!hasProjectId) {
        db.exec(`ALTER TABLE tasks ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)`);
        console.log('✅ Added project_id column to tasks table');
    }

    // Create a default "My Tasks" project if no projects exist
    const projectCount = db.prepare('SELECT COUNT(*) as count FROM projects').get();
    if (projectCount.count === 0) {
        db.prepare(`
            INSERT INTO projects (name, color, icon) VALUES (?, ?, ?)
        `).run('My Tasks', '#818cf8', '📋');
        console.log('✅ Created default "My Tasks" project');
    }

    console.log('✅ Projects table initialized');
}

/**
 * Create a new project
 * @param {string} name - Project name
 * @param {string} color - Hex color code
 * @param {string} icon - Emoji icon
 * @returns {Object} Created project
 */
function createProject(name, color = '#818cf8', icon = '📁') {
    if (!name || name.trim() === '') {
        throw new Error('Project name is required');
    }

    const stmt = db.prepare(`
        INSERT INTO projects (name, color, icon)
        VALUES (?, ?, ?)
    `);

    const result = stmt.run(name.trim(), color, icon);

    return {
        id: result.lastInsertRowid,
        name: name.trim(),
        color,
        icon,
        view_mode: 'list',
        created_at: new Date().toISOString()
    };
}

/**
 * Get all projects
 * @returns {Array} Array of all projects with task counts
 */
function getAllProjects() {
    const stmt = db.prepare(`
        SELECT
            p.*,
            COUNT(t.id) as task_count,
            SUM(CASE WHEN t.status != 'Done' THEN 1 ELSE 0 END) as active_task_count
        FROM projects p
        LEFT JOIN tasks t ON t.project_id = p.id
        GROUP BY p.id
        ORDER BY p.created_at ASC
    `);

    return stmt.all();
}

/**
 * Get a project by ID
 * @param {number} id - Project ID
 * @returns {Object|null} Project or null
 */
function getProjectById(id) {
    const stmt = db.prepare(`
        SELECT
            p.*,
            COUNT(t.id) as task_count,
            SUM(CASE WHEN t.status != 'Done' THEN 1 ELSE 0 END) as active_task_count
        FROM projects p
        LEFT JOIN tasks t ON t.project_id = p.id
        WHERE p.id = ?
        GROUP BY p.id
    `);

    return stmt.get(id) || null;
}

/**
 * Update a project
 * @param {number} id - Project ID
 * @param {Object} updates - Fields to update
 * @returns {Object} Updated project
 */
function updateProject(id, updates) {
    const project = getProjectById(id);
    if (!project) {
        throw new Error(`Project with id ${id} not found`);
    }

    const allowedFields = ['name', 'color', 'icon', 'view_mode'];
    const fields = Object.keys(updates).filter(key => allowedFields.includes(key));

    if (fields.length === 0) {
        throw new Error('No valid fields to update');
    }

    // Validate name if updating
    if (updates.name !== undefined && updates.name.trim() === '') {
        throw new Error('Project name cannot be empty');
    }

    if (updates.view_mode !== undefined) {
        const validModes = ['list', 'kanban'];
        if (!validModes.includes(updates.view_mode)) {
            throw new Error('Invalid view_mode. Must be list or kanban');
        }
    }

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = fields.map(field => updates[field]);
    values.push(id);

    const stmt = db.prepare(`UPDATE projects SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
    stmt.run(...values);

    return getProjectById(id);
}

/**
 * Delete a project
 * @param {number} id - Project ID
 * @returns {boolean} True if deleted
 */
function deleteProject(id) {
    const project = getProjectById(id);
    if (!project) {
        return false;
    }

    // Unassign all tasks from this project (set project_id to null)
    db.prepare('UPDATE tasks SET project_id = NULL WHERE project_id = ?').run(id);

    // Delete the project
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);

    return true;
}

/**
 * Get tasks for a specific project
 * @param {number} projectId - Project ID
 * @returns {Array} Array of tasks
 */
function getTasksByProject(projectId) {
    const stmt = db.prepare(`
        SELECT * FROM tasks
        WHERE project_id = ?
        ORDER BY
            CASE WHEN status = 'Done' THEN 1 ELSE 0 END,
            due_date ASC NULLS LAST,
            CASE priority WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 WHEN 'Low' THEN 2 END,
            created_at DESC
    `);

    return stmt.all(projectId);
}

/**
 * Assign a task to a project
 * @param {number} taskId - Task ID
 * @param {number|null} projectId - Project ID (null to unassign)
 * @returns {boolean} True if updated
 */
function assignTaskToProject(taskId, projectId) {
    // Verify project exists if projectId is provided
    if (projectId !== null) {
        const project = getProjectById(projectId);
        if (!project) {
            throw new Error(`Project with id ${projectId} not found`);
        }
    }

    const stmt = db.prepare('UPDATE tasks SET project_id = ? WHERE id = ?');
    const result = stmt.run(projectId, taskId);

    return result.changes > 0;
}

module.exports = {
    initProjectsTable,
    createProject,
    getAllProjects,
    getProjectById,
    updateProject,
    deleteProject,
    getTasksByProject,
    assignTaskToProject
};
