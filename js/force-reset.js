// Force Reset Script - Resetare completă și forțată
// Rulează acest script în consola browserului (F12)

async function forceResetDatabase() {
    console.log('🚨 FORȚARE RESETARE COMPLETĂ...');
    
    try {
        // 1. Ștergem toate bazele de date posibile
        const databases = await indexedDB.databases();
        for (const db of databases) {
            if (db.name.includes('MyLibrary')) {
                await indexedDB.deleteDatabase(db.name);
                console.log(`✅ Șters: ${db.name}`);
            }
        }
        
        // 2. Ștergem localStorage și sessionStorage
        localStorage.clear();
        sessionStorage.clear();
        console.log('✅ localStorage/sessionMemory șterse');
        
        // 3. Forțăm reîncărcare completă
        console.log('🔄 Reîncărcare forțată...');
        setTimeout(() => {
            location.reload(true); // true forțează reîncărcare de la server
        }, 1000);
        
    } catch (error) {
        console.error('❌ Eroare la resetare forțată:', error);
    }
}

// Rulează automat
forceResetDatabase();

console.log('⚡ RESETARE FORȚATĂ ÎN PROGRES! Toate cărțile vor avea 10 stocuri după reîncărcare.');
