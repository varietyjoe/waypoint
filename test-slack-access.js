const path = require('path');
require('dotenv').config();

const slackClient = require('./src/integrations/slack-client');
const oauthTokensDb = require('./src/database/oauth-tokens');
const monitoredChannelsDb = require('./src/database/monitored-channels');

async function testSlackAccess() {
    console.log('🔍 Testing Slack access...\n');

    // Check for token
    const tokenData = await oauthTokensDb.getToken('slack');
    if (!tokenData) {
        console.log('❌ No Slack token found');
        return;
    }
    console.log('✅ Slack token found');
    console.log('   Workspace:', tokenData.workspace_name);
    console.log('   Scope:', tokenData.scope);
    console.log('');

    // Check monitored channels
    const channels = await monitoredChannelsDb.getChannels("slack", true);
    console.log(`📡 Monitored channels: ${channels.length}`);
    channels.forEach(ch => {
        console.log(`   - ${ch.channel_name} (${ch.channel_id})`);
    });
    console.log('');

    // Try to fetch messages from first channel
    if (channels.length > 0) {
        const channel = channels[0];
        console.log(`📨 Fetching messages from #${channel.channel_name}...`);
        const messages = await slackClient.getChannelHistory(tokenData.access_token, channel.channel_id, { limit: 5 });
        console.log(`   Found ${messages.length} messages`);

        if (messages.length > 0) {
            console.log('   Recent messages:');
            messages.forEach((msg, i) => {
                console.log(`   ${i + 1}. [${msg.ts}] ${msg.user}: ${msg.text?.substring(0, 80)}${msg.text?.length > 80 ? '...' : ''}`);
            });
        }
        console.log('');
    }

    // Try to fetch DM conversations
    console.log('💬 Fetching DM conversations...');
    const dmConversations = await slackClient.getDMConversations(tokenData.access_token);
    console.log(`   Found ${dmConversations.length} DM conversations`);

    if (dmConversations.length > 0) {
        const dm = dmConversations[0];
        console.log(`   First DM: ${dm.id}`);
        console.log(`   Fetching messages from first DM...`);
        const dmMessages = await slackClient.getChannelHistory(tokenData.access_token, dm.id, { limit: 5 });
        console.log(`   Found ${dmMessages.length} messages in DM`);

        if (dmMessages.length > 0) {
            console.log('   Recent DM messages:');
            dmMessages.forEach((msg, i) => {
                console.log(`   ${i + 1}. [${msg.ts}] ${msg.user}: ${msg.text?.substring(0, 80)}${msg.text?.length > 80 ? '...' : ''}`);
            });
        }
    }

    console.log('\n✅ Test complete');
}

testSlackAccess().catch(console.error);
