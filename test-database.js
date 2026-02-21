const tasks = require('./src/database/tasks');
const notes = require('./src/database/notes');

async function testDatabase() {
    console.log('=== Testing Database Functions ===\n');

    try {
        // Test Task Functions
        console.log('--- Testing Task Functions ---');

        // Create tasks
        console.log('\n1. Creating tasks...');
        const task1 = await tasks.createTask(
            'Build authentication system',
            'Implement JWT-based authentication',
            'Doing',
            'High',
            '2024-02-01'
        );
        console.log('Created task 1:', task1);

        const task2 = await tasks.createTask(
            'Design database schema',
            null,
            'Done',
            'Medium'
        );
        console.log('Created task 2:', task2);

        const task3 = await tasks.createTask(
            'Write documentation',
            'Create user guide and API docs',
            'To do',
            'Low'
        );
        console.log('Created task 3:', task3);

        // Get all tasks
        console.log('\n2. Getting all tasks...');
        const allTasks = await tasks.getAllTasks();
        console.log(`Found ${allTasks.length} tasks`);

        // Get task by ID
        console.log('\n3. Getting task by ID...');
        const fetchedTask = await tasks.getTaskById(task1.id);
        console.log('Fetched task:', fetchedTask);

        // Update task
        console.log('\n4. Updating task...');
        const updatedTask = await tasks.updateTask(task1.id, {
            status: 'Blocked',
            description: 'Waiting for security review'
        });
        console.log('Updated task:', updatedTask);

        // Get tasks by status
        console.log('\n5. Getting tasks by status (To do)...');
        const todoTasks = await tasks.getTasksByStatus('To do');
        console.log(`Found ${todoTasks.length} to-do tasks`);

        // Test Note Functions
        console.log('\n\n--- Testing Note Functions ---');

        // Create notes
        console.log('\n1. Creating notes...');
        const note1 = await notes.createNote(
            'Authentication Research',
            'OAuth 2.0 vs JWT - JWT seems more suitable for our stateless API',
            task1.id
        );
        console.log('Created note 1 (linked to task):', note1);

        const note2 = await notes.createNote(
            'Meeting Notes',
            'Discussed project timeline and milestones'
        );
        console.log('Created note 2 (standalone):', note2);

        // Get all notes
        console.log('\n2. Getting all notes...');
        const allNotes = await notes.getAllNotes();
        console.log(`Found ${allNotes.length} notes`);

        // Get note by ID
        console.log('\n3. Getting note by ID...');
        const fetchedNote = await notes.getNoteById(note1.id);
        console.log('Fetched note:', fetchedNote);

        // Update note
        console.log('\n4. Updating note...');
        const updatedNote = await notes.updateNote(note1.id, {
            content: 'OAuth 2.0 vs JWT - JWT is better for our stateless API. Decided to use JWT.'
        });
        console.log('Updated note:', updatedNote);

        // Get notes by task
        console.log('\n5. Getting notes linked to task...');
        const taskNotes = await notes.getNotesByTask(task1.id);
        console.log(`Found ${taskNotes.length} notes linked to task ${task1.id}`);

        // Delete operations
        console.log('\n\n--- Testing Delete Operations ---');

        console.log('\n1. Deleting a note...');
        const noteDeleted = await notes.deleteNote(note2.id);
        console.log(`Note deleted: ${noteDeleted}`);

        console.log('\n2. Deleting a task...');
        const taskDeleted = await tasks.deleteTask(task3.id);
        console.log(`Task deleted: ${taskDeleted}`);

        // Verify deletions
        console.log('\n3. Verifying deletions...');
        const remainingTasks = await tasks.getAllTasks();
        const remainingNotes = await notes.getAllNotes();
        console.log(`Remaining tasks: ${remainingTasks.length}`);
        console.log(`Remaining notes: ${remainingNotes.length}`);

        // Test error handling
        console.log('\n\n--- Testing Error Handling ---');

        try {
            console.log('\n1. Trying to create task without title...');
            await tasks.createTask('');
        } catch (error) {
            console.log('✓ Error caught:', error.message);
        }

        try {
            console.log('\n2. Trying to create task with invalid status...');
            await tasks.createTask('Test', null, 'InvalidStatus');
        } catch (error) {
            console.log('✓ Error caught:', error.message);
        }

        try {
            console.log('\n3. Trying to link note to non-existent task...');
            await notes.createNote('Test Note', 'Content', 99999);
        } catch (error) {
            console.log('✓ Error caught:', error.message);
        }

        try {
            console.log('\n4. Trying to get non-existent task...');
            const nonExistent = await tasks.getTaskById(99999);
            console.log('✓ Result:', nonExistent === null ? 'null (as expected)' : 'unexpected');
        } catch (error) {
            console.log('Error:', error.message);
        }

        console.log('\n\n=== All Tests Completed Successfully! ===');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
    }
}

// Run tests
testDatabase();
