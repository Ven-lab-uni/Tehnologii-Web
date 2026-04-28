// Database.js - Sistem Complet E-commerce cu Encoding Corect
// Tehnologie: IndexedDB + localStorage pentru sincronizare între tab-uri
// Avantaje: Fără server, date persistente, sincronizare real-time

class DatabaseManager {
    constructor() {
        this.dbName = 'MyLibraryDB';
        this.version = 1;
        this.db = null;
        this.booksData = null;
    }

    // ========================================
    // METODA PRINCIPALĂ DE INIȚIALIZARE
    // ========================================
    async init() {
        try {
            console.log('🚀 Inițializare sistem e-commerce...');
            
            // Pas 1: Încărcăm datele cărților din JSON
            await this.loadBooksData();
            
            // Pas 2: Inițializăm baza de date IndexedDB
            await this.initDatabase();
            
            // Pas 3: Populăm DB doar dacă e goală
            await this.populateIfEmpty();
            
            // Pas 4: Inițializăm interfețele UI
            await this.initializeCart();
            await this.initializeBookBuying();
            
            // Pas 5: Setup sincronizare globală
            this.setupOrderSync();
            
            console.log('✅ Sistem e-commerce inițializat cu succes!');
            return true;
        } catch (error) {
            console.error('❌ Eroare la inițializare:', error);
            return false;
        }
    }

    // ========================================
    // ÎNCĂRCARE DATE DIN JSON
    // ========================================
    async loadBooksData() {
        try {
            const response = await fetch('../assets/data/books.json');
            this.booksData = await response.json();
            console.log(`📚 Date încărcate: ${this.booksData.length} cărți`);
        } catch (error) {
            console.error('❌ Eroare la încărcarea books.json:', error);
            throw error;
        }
    }

    // ========================================
    // INIȚIALIZARE INDEXEDDB
    // ========================================
    initDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                console.log('🗄️ Baza de date conectată:', this.dbName);
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                this.db = event.target.result;
                
                if (!this.db.objectStoreNames.contains('books')) {
                    const booksStore = this.db.createObjectStore('books', { keyPath: 'id' });
                    booksStore.createIndex('title', 'title', { unique: false });
                    booksStore.createIndex('isbn', 'isbn', { unique: true });
                    console.log('📦 Store "books" creat');
                }
                
                if (!this.db.objectStoreNames.contains('cart')) {
                    const cartStore = this.db.createObjectStore('cart', { keyPath: 'id' });
                    cartStore.createIndex('bookId', 'bookId', { unique: false });
                    console.log('🛒 Store "cart" creat');
                }
                
                if (!this.db.objectStoreNames.contains('orders')) {
                    const ordersStore = this.db.createObjectStore('orders', { keyPath: 'id', autoIncrement: true });
                    ordersStore.createIndex('date', 'date', { unique: false });
                    console.log('📋 Store "orders" creat');
                }
            };
        });
    }

    // ========================================
    // POPULARE BAZĂ DE DATE (forțăm resincronizare)
    // ========================================
    async populateIfEmpty() {
        const books = await this.getAllBooks();
        
        console.log(`📚 Stare actuală DB: ${books.length} cărți`);
        
        let needsUpdate = false;
        for (const jsonBook of this.booksData) {
            const dbBook = books.find(b => b.id === jsonBook.id);
            if (!dbBook || dbBook.stock !== jsonBook.stock) {
                needsUpdate = true;
                console.log(`🔄 Necesită actualizare: ${jsonBook.title} (DB: ${dbBook?.stock || 'null'}, JSON: ${jsonBook.stock})`);
                break;
            }
        }
        
        if (books.length === 0 || needsUpdate) {
            console.log('📥 Populare/Actualizare bază de date...');
            
            const transaction = this.db.transaction(['books'], 'readwrite');
            const store = transaction.objectStore('books');
            
            const clearRequest = store.clear();
            
            clearRequest.onsuccess = () => {
                console.log('🗑️ Baza de date curățată, adăugăm date noi...');
                this.booksData.forEach(book => store.add(book));
            };
            
            return new Promise((resolve, reject) => {
                transaction.oncomplete = () => {
                    console.log(`✅ Baza de date actualizată cu ${this.booksData.length} cărți (toate cu 10 stocuri)`);
                    resolve();
                };
                transaction.onerror = () => reject(transaction.error);
            });
        } else {
            console.log('📚 Baza de date este sincronizată');
        }
    }

    // ========================================
    // METODE CRUD PENTRU CĂRȚI
    // ========================================
    async getAllBooks() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['books'], 'readonly');
            const store = transaction.objectStore('books');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getBookById(bookId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['books'], 'readonly');
            const store = transaction.objectStore('books');
            const request = store.get(parseInt(bookId));
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async updateBookStock(bookId, quantity) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['books'], 'readwrite');
            const store = transaction.objectStore('books');
            
            const getRequest = store.get(parseInt(bookId));
            getRequest.onsuccess = () => {
                const book = getRequest.result;
                if (book) {
                    const oldStock = book.stock;
                    book.stock -= quantity;
                    if (book.stock < 0) book.stock = 0;
                    
                    const updateRequest = store.put(book);
                    updateRequest.onsuccess = () => {
                        console.log(`📦 Stoc actualizat: ${book.title} (${oldStock} → ${book.stock})`);
                        resolve(book);
                    };
                    updateRequest.onerror = () => reject(updateRequest.error);
                }
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    // ========================================
    // METODE PENTRU COȘ DE CUMPĂRĂTURI
    // ========================================
    async addToCart(bookId, quantity = 1) {
        const book = await this.getBookById(bookId);
        if (!book) throw new Error('Cartea nu a fost găsită');
        if (book.stock < quantity) throw new Error('Stoc insuficient');
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cart'], 'readwrite');
            const store = transaction.objectStore('cart');
            
            const index = store.index('bookId');
            const getRequest = index.get(parseInt(bookId));
            
            getRequest.onsuccess = () => {
                const existingItem = getRequest.result;
                
                if (existingItem) {
                    existingItem.quantity += quantity;
                    const updateRequest = store.put(existingItem);
                    updateRequest.onsuccess = () => resolve(existingItem);
                    updateRequest.onerror = () => reject(updateRequest.error);
                } else {
                    const cartItem = {
                        id: Date.now(),
                        bookId: bookId,
                        quantity: quantity,
                        price: book.price,
                        title: book.title,
                        addedAt: new Date()
                    };
                    
                    const addRequest = store.add(cartItem);
                    addRequest.onsuccess = () => resolve(cartItem);
                    addRequest.onerror = () => reject(addRequest.error);
                }
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    async getCartItems() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cart'], 'readonly');
            const store = transaction.objectStore('cart');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getCartItemsWithDetails() {
        const cartItems = await this.getCartItems();
        return Promise.all(
            cartItems.map(item => 
                this.getBookById(item.bookId)
                    .then(book => ({ ...item, book }))
            )
        );
    }

    async removeFromCart(itemId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cart'], 'readwrite');
            const store = transaction.objectStore('cart');
            const request = store.delete(itemId);
            request.onsuccess = () => {
                console.log('🗑️ Produs eliminat din coș:', itemId);
                resolve(itemId);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async clearCart() {
        const items = await this.getCartItems();
        for (const item of items) {
            await this.updateBookStock(item.bookId, -item.quantity);
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cart'], 'readwrite');
            const store = transaction.objectStore('cart');
            const request = store.clear();
            request.onsuccess = () => {
                console.log('🛒 Coș golit și stoc restaurat');
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    // ========================================
    // METODE PENTRU COMENZI
    // ========================================
    async createOrder(orderData) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['orders'], 'readwrite');
            const store = transaction.objectStore('orders');
            
            const order = {
                ...orderData,
                id: Date.now(),
                date: new Date(),
                status: 'pending',
                orderNumber: this.generateOrderNumber()
            };
            
            const request = store.add(order);
            request.onsuccess = () => {
                console.log('📋 Comandă creată:', order.orderNumber);
                
                // Notifică alte tab-uri despre comandă nouă
                this.notifyOrderUpdate('new_order', order);
                
                resolve(order);
            };
            request.onerror = () => reject(request.error);
        });
    }

    generateOrderNumber() {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const random = Math.floor(Math.random() * 1000);
        return `ORD-${year}${month}${day}-${random}`;
    }

    async getAllOrders() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['orders'], 'readonly');
            const store = transaction.objectStore('orders');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async updateOrderStatus(orderId, status) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['orders'], 'readwrite');
            const store = transaction.objectStore('orders');
            
            const getRequest = store.get(orderId);
            getRequest.onsuccess = () => {
                const order = getRequest.result;
                if (order) {
                    const oldStatus = order.status;
                    order.status = status;
                    order.updatedAt = new Date();
                    
                    const updateRequest = store.put(order);
                    updateRequest.onsuccess = () => {
                        console.log(`📋 Status comandă actualizat: #${order.orderNumber} (${oldStatus} → ${status})`);
                        
                        // Notifică alte tab-uri despre schimbarea de status
                        this.notifyOrderUpdate('status_update', order);
                        
                        resolve(order);
                    };
                    updateRequest.onerror = () => reject(updateRequest.error);
                }
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    async clearAllOrders() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['orders'], 'readwrite');
            const store = transaction.objectStore('orders');
            const request = store.clear();
            request.onsuccess = () => {
                console.log('📋 Toate comenzile au fost șterse');
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    async deleteOrder(orderId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['orders'], 'readwrite');
            const store = transaction.objectStore('orders');
            const request = store.delete(orderId);
            request.onsuccess = () => {
                console.log('🗑️ Comandă ștearsă:', orderId);
                resolve(orderId);
            };
            request.onerror = () => reject(request.error);
        });
    }

    // ========================================
    // SINCRONIZARE GLOBALĂ PENTRU COMENZI
    // ========================================
    notifyOrderUpdate(type, order) {
        try {
            localStorage.setItem('order_update', JSON.stringify({
                type: type,
                order: order,
                timestamp: Date.now()
            }));
            
            setTimeout(() => {
                localStorage.removeItem('order_update');
            }, 5000);
        } catch (error) {
            console.log('ℹ️ LocalStorage nu disponibil pentru sincronizare');
        }
    }

    setupOrderSync() {
        window.addEventListener('storage', (e) => {
            if (e.key === 'order_update') {
                try {
                    const update = JSON.parse(e.newValue);
                    this.handleOrderUpdate(update);
                } catch (error) {
                    console.error('❌ Eroare la procesarea update-ului:', error);
                }
            }
        });
    }

    handleOrderUpdate(update) {
        console.log('📡 Primit update comandă:', update.type);
        
        switch(update.type) {
            case 'new_order':
                if (window.location.href.includes('admin.html')) {
                    this.showNotification(`Comandă nouă: #${update.order.orderNumber}`, 'success');
                    if (window.adminPanel) {
                        window.adminPanel.loadOrders();
                    }
                }
                break;
            case 'status_update':
                if (window.location.href.includes('admin.html') && window.adminPanel) {
                    window.adminPanel.loadOrders();
                }
                break;
        }
    }

    // ========================================
    // METODE UI - COȘ DE CUMPĂRĂTURI
    // ========================================
    async initializeCart() {
        const navContainer = document.querySelector('.nav-container');
        if (navContainer && !document.querySelector('.cart-icon')) {
            const cartIcon = document.createElement('div');
            cartIcon.className = 'cart-icon';
            cartIcon.innerHTML = `
                <i class="fas fa-shopping-cart"></i>
                <span class="cart-count">0</span>
            `;
            cartIcon.style.cssText = `
                position: relative;
                cursor: pointer;
                margin-left: auto;
                padding: 0.5rem;
                border-radius: 50%;
                transition: background 0.3s ease;
            `;
            
            cartIcon.addEventListener('click', () => this.showCartModal());
            navContainer.appendChild(cartIcon);
            
            await this.updateCartCount();
        }
    }

    async updateCartCount() {
        const items = await this.getCartItems();
        const cartCount = document.querySelector('.cart-count');
        if (cartCount) {
            cartCount.textContent = items.length;
        }
    }

    async showCartModal() {
        const items = await this.getCartItemsWithDetails();
        
        if (items.length === 0) {
            this.showNotification('Coșul de cumpărături este gol', 'info');
            return;
        }
        
        this.createCartModal(items);
    }

    createCartModal(items) {
        const existingModal = document.querySelector('.cart-modal');
        if (existingModal) existingModal.remove();
        
        const modal = document.createElement('div');
        modal.className = 'cart-modal';
        
        const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        
        modal.innerHTML = `
            <div class="cart-modal-content">
                <div class="cart-modal-header">
                    <h3>Coș de Cumpărături</h3>
                    <button class="cart-modal-close">&times;</button>
                </div>
                <div class="cart-modal-body">
                    ${items.map(item => `
                        <div class="cart-item" data-item-id="${item.id}">
                            <div class="cart-item-info">
                                <h4>${item.book.title}</h4>
                                <p>${item.book.author}</p>
                                <p class="cart-item-price">${item.price.toFixed(2)} € x ${item.quantity}</p>
                            </div>
                            <div class="cart-item-actions">
                                <button class="quantity-btn minus" onclick="dbManager.updateCartItemQuantity(${item.id}, -1)">-</button>
                                <span class="quantity">${item.quantity}</span>
                                <button class="quantity-btn plus" onclick="dbManager.updateCartItemQuantity(${item.id}, 1)">+</button>
                                <button class="remove-btn" onclick="dbManager.removeCartItem(${item.id})">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="cart-modal-footer">
                    <div class="cart-total">
                        <strong>Total: ${total.toFixed(2)} €</strong>
                    </div>
                    <div class="cart-actions">
                        <button class="btn-clear-cart" onclick="dbManager.clearCartItems()">Golește coșul</button>
                        <button class="btn-checkout" onclick="dbManager.checkout()">Finalizează comanda</button>
                    </div>
                </div>
            </div>
        `;
        
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            animation: fadeIn 0.3s ease-out;
        `;
        
        document.body.appendChild(modal);
        
        modal.querySelector('.cart-modal-close').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    async updateCartItemQuantity(itemId, change) {
        try {
            const items = await this.getCartItems();
            const item = items.find(i => i.id === itemId);
            
            if (!item) return;
            
            const newQuantity = item.quantity + change;
            
            if (newQuantity <= 0) {
                await this.removeFromCart(itemId);
                this.showNotification('Produs eliminat din coș', 'success');
                this.showCartModal();
                this.updateCartCount();
            } else {
                const book = await this.getBookById(item.bookId);
                if (book.stock >= newQuantity) {
                    const transaction = this.db.transaction(['cart'], 'readwrite');
                    const store = transaction.objectStore('cart');
                    item.quantity = newQuantity;
                    store.put(item);
                    
                    this.showCartModal();
                    this.updateCartCount();
                } else {
                    this.showNotification('Stoc insuficient', 'error');
                }
            }
        } catch (error) {
            console.error('Eroare la actualizarea coșului:', error);
            this.showNotification('Eroare la actualizarea coșului', 'error');
        }
    }

    async removeCartItem(itemId) {
        try {
            await this.removeFromCart(itemId);
            this.showNotification('Produs eliminat din coș', 'success');
            this.showCartModal();
            this.updateCartCount();
        } catch (error) {
            console.error('Eroare la eliminarea produsului:', error);
            this.showNotification('Eroare la eliminarea produsului', 'error');
        }
    }

    async clearCartItems() {
        if (confirm('Ești sigur că vrei să golești coșul de cumpărături? Produsele vor reveni în stoc.')) {
            try {
                await this.clearCart();
                this.showNotification('Coș golit cu succes. Stocurile au fost restaurate.', 'success');
                document.querySelector('.cart-modal')?.remove();
                this.updateCartCount();
            } catch (error) {
                console.error('Eroare la golirea coșului:', error);
                this.showNotification('Eroare la golirea coșului', 'error');
            }
        }
    }

    async checkout() {
        try {
            const items = await this.getCartItemsWithDetails();
            const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            
            const orderData = {
                items: items,
                total: total,
                customerInfo: {
                    name: 'Utilizator My Library',
                    email: 'user@mylibrary.com',
                    phone: '+40 123 456 789'
                }
            };
            
            const order = await this.createOrder(orderData);
            
            await this.clearCart();
            
            this.showOrderConfirmation(order);
            this.simulateEmailConfirmation(order);
            
            document.querySelector('.cart-modal')?.remove();
            this.updateCartCount();
            
        } catch (error) {
            console.error('Eroare la plasarea comenzii:', error);
            this.showNotification('Eroare la plasarea comenzii', 'error');
        }
    }

    showOrderConfirmation(order) {
        const confirmationModal = document.createElement('div');
        confirmationModal.className = 'order-confirmation-modal';
        
        confirmationModal.innerHTML = `
            <div class="confirmation-content">
                <div class="confirmation-header">
                    <div class="success-icon">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <h2>Comandă Plasată cu Succes!</h2>
                    <p class="order-number">Comanda #${order.orderNumber}</p>
                </div>
                <div class="confirmation-details">
                    <h3>Detalii Comandă:</h3>
                    <div class="order-items">
                        ${order.items.map(item => `
                            <div class="order-item">
                                <span class="item-title">${item.title}</span>
                                <span class="item-quantity">x${item.quantity}</span>
                                <span class="item-price">${(item.price * item.quantity).toFixed(2)} €</span>
                            </div>
                        `).join('')}
                    </div>
                    <div class="order-total">
                        <strong>Total: ${order.total.toFixed(2)} €</strong>
                    </div>
                </div>
                <div class="confirmation-actions">
                    <button class="btn-continue" onclick="this.closest('.order-confirmation-modal').remove()">
                        Continuă Cumpărăturile
                    </button>
                </div>
            </div>
        `;
        
        confirmationModal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10001;
            animation: fadeIn 0.3s ease-out;
        `;
        
        document.body.appendChild(confirmationModal);
        
        setTimeout(() => {
            if (confirmationModal.parentNode) {
                confirmationModal.style.animation = 'fadeOut 0.3s ease-out';
                setTimeout(() => confirmationModal.remove(), 300);
            }
        }, 5000);
    }

    simulateEmailConfirmation(order) {
        console.log('📧 EMAIL SIMULAT - Confirmare Comandă');
        console.log('=====================================');
        console.log('Către: user@mylibrary.com');
        console.log('Subiect: Confirmare Comandă #' + order.orderNumber);
        console.log('');
        console.log('Bună Utilizator My Library,');
        console.log('');
        console.log('Comanda dumneavoastră a fost plasată cu succes!');
        console.log('Număr comandă: ' + order.orderNumber);
        console.log('Data: ' + new Date().toLocaleDateString('ro-RO'));
        console.log('Total: ' + order.total.toFixed(2) + ' €');
        console.log('');
        console.log('Produse comandate:');
        order.items.forEach(item => {
            console.log('- ' + item.title + ' x' + item.quantity + ' = ' + (item.price * item.quantity).toFixed(2) + ' €');
        });
        console.log('');
        console.log('Vă mulțumim pentru comandă!');
        console.log('Echipa My Library');
        console.log('=====================================');
        
        this.showNotification('📧 Email de confirmare trimis la user@mylibrary.com', 'success');
    }

    // ========================================
    // METODE UI - BUTOANE CUMPĂRARE
    // ========================================
    async initializeBookBuying() {
        const pathParts = window.location.pathname.split('/');
        const bookId = pathParts[pathParts.length - 1].replace('.html', '').replace('book', '');
        
        if (bookId && !isNaN(bookId)) {
            await this.checkBookStock(parseInt(bookId));
        }
    }

    async checkBookStock(bookId) {
        const book = await this.getBookById(bookId);
        if (book) {
            this.createBuyButton(book);
        }
    }

    createBuyButton(book) {
        const container = document.querySelector('.book-stats') || document.querySelector('.book-info-section');
        if (!container) return;
        
        const existingButton = document.querySelector('.buy-button-container');
        if (existingButton) existingButton.remove();
        
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'buy-button-container';
        buttonContainer.style.cssText = `
            margin-top: 2rem;
            padding: 1rem;
            background: ${book.stock > 0 ? '#f8f9fa' : '#fff5f5'};
            border-radius: 8px;
            border: 2px solid ${book.stock > 0 ? '#28a745' : '#dc3545'};
            text-align: center;
        `;
        
        if (book.stock > 0) {
            buttonContainer.innerHTML = `
                <button class="buy-button" onclick="dbManager.buyBook(${book.id})" style="
                    background: #28a745;
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 6px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                ">
                    <i class="fas fa-shopping-cart"></i> Cumpără acum - ${book.price.toFixed(2)} €
                </button>
                <p style="margin: 0.5rem 0 0 0; color: #6c757d; font-size: 14px;">
                    <i class="fas fa-check-circle" style="color: #28a745;"></i> 
                    ${book.stock} bucăți în stoc
                </p>
            `;
        } else {
            buttonContainer.innerHTML = `
                <button class="buy-button out-of-stock" disabled style="
                    background: #6c757d;
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 6px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: not-allowed;
                    opacity: 0.7;
                ">
                    <i class="fas fa-times-circle"></i> Stoc epuizat
                </button>
                <p style="margin: 0.5rem 0 0 0; color: #dc3545; font-size: 14px; font-weight: 600;">
                    <i class="fas fa-exclamation-triangle"></i> 
                    Momentan nu este disponibil
                </p>
            `;
        }
        
        container.appendChild(buttonContainer);
    }

    async buyBook(bookId) {
        try {
            const book = await this.getBookById(bookId);
            if (!book || book.stock <= 0) {
                this.showNotification('Cartea nu este în stoc', 'error');
                return;
            }
            
            await this.addToCart(bookId, 1);
            await this.updateBookStock(bookId, 1);
            
            this.showNotification(`"${book.title}" a fost adăugat în coș!`, 'success');
            this.checkBookStock(bookId);
            this.updateCartCount();
            
        } catch (error) {
            console.error('Eroare la cumpărare:', error);
            this.showNotification('Eroare la adăugarea în coș', 'error');
        }
    }

    // ========================================
    // SISTEM DE NOTIFICĂRI
    // ========================================
    showNotification(message, type = 'info') {
        const existingNotification = document.querySelector('.notification');
        if (existingNotification) existingNotification.remove();
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
                <span>${message}</span>
            </div>
            <button class="notification-close">&times;</button>
        `;
        
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#27ae60' : type === 'error' ? '#e74c3c' : '#3498db'};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
            z-index: 10000;
            max-width: 400px;
            animation: slideInRight 0.3s ease-out;
        `;
        
        document.body.appendChild(notification);
        
        notification.querySelector('.notification-close').addEventListener('click', () => notification.remove());
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideOutRight 0.3s ease-out';
                setTimeout(() => notification.remove(), 300);
            }
        }, 5000);
    }
}

// ========================================
// STILURI CSS PENTRU TOATE COMPONENTELE
// ========================================
const appStyles = document.createElement('style');
appStyles.textContent = `
    .cart-icon:hover { background: rgba(0, 0, 0, 0.1); }
    
    .cart-count {
        position: absolute;
        top: -5px;
        right: -5px;
        background: #dc3545;
        color: white;
        border-radius: 50%;
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 600;
    }
    
    .cart-modal-content {
        background: white;
        border-radius: 12px;
        max-width: 600px;
        max-height: 80vh;
        width: 90%;
        overflow: hidden;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        animation: slideInUp 0.3s ease-out;
    }
    
    .cart-modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1.5rem;
        border-bottom: 1px solid #e9ecef;
        background: #f8f9fa;
    }
    
    .cart-modal-header h3 { margin: 0; color: #333; font-size: 1.5rem; }
    
    .cart-modal-close {
        background: none;
        border: none;
        font-size: 2rem;
        cursor: pointer;
        color: #6c757d;
        padding: 0;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: all 0.3s ease;
    }
    
    .cart-modal-close:hover {
        background: #e9ecef;
        color: #dc3545;
    }
    
    .cart-modal-body {
        max-height: 400px;
        overflow-y: auto;
        padding: 1rem;
    }
    
    .cart-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem;
        border-bottom: 1px solid #e9ecef;
        transition: background 0.3s ease;
    }
    
    .cart-item:hover { background: #f8f9fa; }
    
    .cart-item-info h4 { margin: 0 0 0.5rem 0; color: #333; font-size: 1.1rem; }
    .cart-item-info p { margin: 0.25rem 0; color: #6c757d; font-size: 0.9rem; }
    .cart-item-price { font-weight: 600; color: #28a745; }
    
    .cart-item-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    
    .quantity-btn {
        width: 30px;
        height: 30px;
        border: 1px solid #dee2e6;
        background: white;
        cursor: pointer;
        border-radius: 4px;
        font-weight: 600;
        transition: all 0.3s ease;
    }
    
    .quantity-btn:hover { background: #f8f9fa; border-color: #adb5bd; }
    .quantity-btn.minus { color: #dc3545; }
    .quantity-btn.plus { color: #28a745; }
    .quantity { min-width: 30px; text-align: center; font-weight: 600; }
    
    .remove-btn {
        width: 30px;
        height: 30px;
        border: none;
        background: #dc3545;
        color: white;
        cursor: pointer;
        border-radius: 4px;
        transition: all 0.3s ease;
    }
    
    .remove-btn:hover {
        background: #c82333;
        transform: scale(1.1);
    }
    
    .cart-modal-footer {
        padding: 1.5rem;
        border-top: 1px solid #e9ecef;
        background: #f8f9fa;
    }
    
    .cart-total {
        text-align: right;
        margin-bottom: 1rem;
        font-size: 1.3rem;
        color: #333;
    }
    
    .cart-actions {
        display: flex;
        gap: 1rem;
        justify-content: flex-end;
    }
    
    .btn-clear-cart {
        padding: 0.75rem 1.5rem;
        border: 1px solid #dc3545;
        background: white;
        color: #dc3545;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
        transition: all 0.3s ease;
    }
    
    .btn-clear-cart:hover {
        background: #dc3545;
        color: white;
    }
    
    .btn-checkout {
        padding: 0.75rem 2rem;
        border: none;
        background: #28a745;
        color: white;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
        transition: all 0.3s ease;
    }
    
    .btn-checkout:hover {
        background: #218838;
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(40, 167, 69, 0.3);
    }
    
    .buy-button:hover {
        background: #218838 !important;
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(40, 167, 69, 0.3);
    }
    
    .buy-button-container {
        animation: slideInUp 0.5s ease-out;
    }
    
    .order-confirmation-modal .confirmation-content {
        background: white;
        border-radius: 12px;
        max-width: 500px;
        width: 90%;
        padding: 2rem;
        text-align: center;
        animation: slideInUp 0.3s ease-out;
    }
    
    .confirmation-header .success-icon {
        font-size: 4rem;
        color: #28a745;
        margin-bottom: 1rem;
    }
    
    .confirmation-header h2 {
        margin: 0 0 0.5rem 0;
        color: #333;
        font-size: 1.8rem;
    }
    
    .order-number {
        color: #6c757d;
        font-size: 1.1rem;
        margin-bottom: 2rem;
    }
    
    .confirmation-details {
        text-align: left;
        margin: 2rem 0;
    }
    
    .confirmation-details h3 {
        margin: 0 0 1rem 0;
        color: #333;
    }
    
    .order-item {
        display: flex;
        justify-content: space-between;
        padding: 0.5rem 0;
        border-bottom: 1px solid #e9ecef;
    }
    
    .order-total {
        text-align: right;
        margin-top: 1rem;
        font-size: 1.2rem;
        color: #333;
    }
    
    .btn-continue {
        padding: 0.75rem 2rem;
        border: none;
        background: #007bff;
        color: white;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
        transition: all 0.3s ease;
    }
    
    .btn-continue:hover {
        background: #0056b3;
        transform: translateY(-2px);
    }
    
    @keyframes slideInUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
    }
    
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    
    @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
    }
    
    @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOutRight {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    .notification-content {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
`;
document.head.appendChild(appStyles);

// ========================================
// INSTANȚĂ GLOBALĂ ȘI INIȚIALIZARE
// ========================================
window.dbManager = null;

document.addEventListener('DOMContentLoaded', async function() {
    console.log('🌐 Pagină încărcată - inițializare Database Manager...');
    window.dbManager = new DatabaseManager();
    await window.dbManager.init();
    console.log('🎉 Database Manager gata de utilizare!');
});

console.log('📦 Modulul Database încărcat - Așteptare DOM...');
