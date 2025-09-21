const fs = require('fs');
const path = require('path');
const Redis = require('ioredis');

async function clearImageCache() {
    console.log('Clearing image cache...');
    
    // Clear file cache
    const storagePath = './storage';
    if (fs.existsSync(storagePath)) {
        const files = fs.readdirSync(storagePath);
        let deletedCount = 0;
        
        for (const file of files) {
            // Delete resource files (.rsc), metadata files (.rsm), and temp files (.rst)
            if (file.endsWith('.rsc') || file.endsWith('.rsm') || file.endsWith('.rst') || file.startsWith('default_optimized_')) {
                try {
                    fs.unlinkSync(path.join(storagePath, file));
                    deletedCount++;
                    console.log(`Deleted: ${file}`);
                } catch (error) {
                    console.error(`Error deleting ${file}:`, error.message);
                }
            }
        }
        
        console.log(`Deleted ${deletedCount} file cache entries.`);
    } else {
        console.log('Storage directory not found.');
    }
    
    // Clear Redis cache
    try {
        const redis = new Redis({
            host: 'localhost',
            port: 6379,
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: 3,
        });
        
        console.log('Clearing Redis cache...');
        
        // Clear ALL cache keys to ensure no corruption
        await redis.flushdb();
        console.log('Flushed entire Redis database.');
        
        await redis.quit();
    } catch (error) {
        console.log('Could not connect to Redis or Redis not running:', error.message);
    }
    
    console.log('\nCache cleared! Restart the server to clear memory cache.');
}

clearImageCache().catch(console.error);