(() => {
    const items = [...document.querySelectorAll('[data-cart-item]')];
    const checkoutLink = document.querySelector('[data-checkout-link]');
    const editNotice = document.querySelector('[data-cart-edit-notice]');
    const bookCount = document.querySelector('[data-book-count]');
    const bookLabel = document.querySelector('[data-book-label]');
    const summarySubtotal = document.querySelector('[data-summary-subtotal]');
    const summaryTotal = document.querySelector('[data-summary-total]');
    const formatPrice = new Intl.NumberFormat('en-IN', {
        maximumFraction: 2
    });

    function updateCartPreview() {
        let total = 0;
        let itemCount = 0;
        let hasUnsavedChanges = false;

        for (const item of items) {
            const quantityInput = item.querySelector('input[name="quantity"]');
            const quantity = Number(quantityInput.value);
            const unitPrice = Number(item.dataset.unitPrice);
            const validQuantity = Number.isInteger(quantity) && quantity >= 1 && quantity <= 20;
            const lineTotal = validQuantity && Number.isFinite(unitPrice) ? quantity * unitPrice : 0;
            const lineTotalElement = item.querySelector('[data-line-total]');
            const updateButton = item.querySelector('.update-cart-button');
            const decreaseButton = item.querySelector('[data-quantity-step="-1"]');
            const increaseButton = item.querySelector('[data-quantity-step="1"]');
            const changed = validQuantity && quantity !== Number(quantityInput.defaultValue);

            if (validQuantity && Number.isFinite(unitPrice)) {
                total += lineTotal;
                itemCount += quantity;
            }
            if (!validQuantity || changed) hasUnsavedChanges = true;
            if (lineTotalElement && validQuantity) {
                lineTotalElement.textContent = `₹${formatPrice.format(lineTotal)}`;
            }
            if (updateButton) updateButton.textContent = changed ? 'Save quantity' : 'Update cart';
            if (decreaseButton) decreaseButton.disabled = !validQuantity || quantity <= 1;
            if (increaseButton) increaseButton.disabled = !validQuantity || quantity >= 20;
        }

        if (summarySubtotal) summarySubtotal.textContent = `₹${formatPrice.format(total)}`;
        if (summaryTotal) summaryTotal.textContent = `₹${formatPrice.format(total)}`;
        if (bookCount) bookCount.textContent = String(itemCount);
        if (bookLabel) bookLabel.textContent = itemCount === 1 ? 'item' : 'items';
        if (checkoutLink) {
            checkoutLink.classList.toggle('is-disabled', hasUnsavedChanges);
            checkoutLink.setAttribute('aria-disabled', String(hasUnsavedChanges));
            checkoutLink.tabIndex = hasUnsavedChanges ? -1 : 0;
        }
        if (editNotice) editNotice.hidden = !hasUnsavedChanges;
    }

    for (const item of items) {
        const quantityInput = item.querySelector('input[name="quantity"]');
        const form = item.querySelector('.quantity-form');

        quantityInput.addEventListener('input', updateCartPreview);
        item.querySelectorAll('[data-quantity-step]').forEach(button => {
            button.addEventListener('click', () => {
                const currentQuantity = Number(quantityInput.value) || 1;
                const step = Number(button.dataset.quantityStep);
                quantityInput.value = String(Math.min(20, Math.max(1, currentQuantity + step)));
                quantityInput.dispatchEvent(new Event('input', { bubbles: true }));
            });
        });

        form.addEventListener('submit', event => {
            if (!form.reportValidity()) {
                event.preventDefault();
                return;
            }
            form.querySelector('.update-cart-button').disabled = true;
            form.querySelector('.update-cart-button').textContent = 'Saving…';
        });
    }

    updateCartPreview();
})();
