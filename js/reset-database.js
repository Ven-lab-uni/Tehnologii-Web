// Reset Database Script - Resetează complet baza de date
// Rulează acest script în consola browserului (F12)

async function resetDatabase() {
    console.log('🔄 Început resetare bază de date...');
    
    try {
        // 1. Ștergem baza de date veche
        await new Promise((resolve, reject) => {
            const deleteRequest = indexedDB.deleteDatabase('MyLibraryDB');
            deleteRequest.onsuccess = () => {
                console.log('✅ Baza de date veche ștearsă');
                resolve();
            };
            deleteRequest.onerror = () => reject(deleteRequest.error);
        });
        
        // 2. Așteptăm puțin pentru ștergere completă
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 3. Reîncărcăm pagina pentru inițializare nouă
        console.log('🔄 Reîncărcare pagină pentru inițializare nouă...');
        location.reload();
        
    } catch (error) {
        console.error('❌ Eroare la resetare:', error);
    }
}

// Rulează automat resetarea
resetDatabase();

console.log('🎯 Script de resetare executat! Baza de date va fi ștearsă și recreată cu stocuri de 10 bucăți fiecare.');
