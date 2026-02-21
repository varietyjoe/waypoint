// Add this to the /chat route to debug

router.post('/chat', async (req, res, next) => {
    try {
        const { message, conversationHistory } = req.body;
        
        console.log('📨 Received chat request');
        console.log('Message:', message);
        console.log('API Key exists:', !!process.env.ANTHROPIC_API_KEY);

        if (!message) {
            return res.status(400).json({
                success: false,
                error: 'Message is required'
            });
        }

        console.log('🤖 Calling Claude service...');
        const response = await claudeService.sendMessage(message, conversationHistory || []);
        console.log('✅ Got response from Claude');

        res.json({
            success: true,
            response: response
        });
    } catch (error) {
        console.error('❌ Chat route error:', error);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        next(error);
    }
});
