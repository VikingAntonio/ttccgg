// TCG Dual - Shopping Cart Logic
// Managed via localStorage

const Cart = {
    KEY: 'tcg_cart_items',

    getAll: function() {
        const items = localStorage.getItem(this.KEY);
        return items ? JSON.parse(items) : [];
    },

    add: function(card) {
        const items = this.getAll();
        // Add timestamp to make each entry unique even if it's the same card
        items.push({
            ...card,
            cart_id: Date.now() + Math.random().toString(36).substr(2, 9)
        });
        localStorage.setItem(this.KEY, JSON.stringify(items));
        this.updateBadge();
    },

    remove: function(cartId) {
        let items = this.getAll();
        items = items.filter(item => item.cart_id !== cartId);
        localStorage.setItem(this.KEY, JSON.stringify(items));
        this.updateBadge();
    },

    clear: function() {
        localStorage.removeItem(this.KEY);
        this.updateBadge();
    },

    getCount: function() {
        return this.getAll().length;
    },

    getTotal: function() {
        const items = this.getAll();
        return items.reduce((sum, item) => {
            // Try to parse price as float, remove non-numeric chars except . and ,
            // then normalize comma to dot for parsing
            const priceStr = (item.price || "0").toString().replace(/[^0-9.,]/g, '').replace(',', '.');
            const price = parseFloat(priceStr) || 0;
            return sum + price;
        }, 0);
    },

    updateBadge: function() {
        const count = this.getCount();
        $('#cart-count').text(count);
        if (count > 0) {
            $('#cart-count').show();
        } else {
            $('#cart-count').hide();
        }
    }
};

// Initialize badge on load if jQuery is present
$(document).ready(function() {
    Cart.updateBadge();
});
