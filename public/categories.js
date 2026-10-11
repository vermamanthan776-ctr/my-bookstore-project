(() => {
    const root = document.getElementById('categories-root');
    const { books, categories, selectedCategory } = JSON.parse(root.dataset.initialState);
    const h = React.createElement;

    function BookCover({ book, index }) {
        const [imageFailed, setImageFailed] = React.useState(false);
        if (book.image && !imageFailed) {
            return h('img', {
                className: 'book-cover-image',
                src: book.image,
                alt: `Cover of ${book.title}`,
                loading: 'lazy',
                onError: () => setImageFailed(true)
            });
        }

        return h('div', {
            className: `book-cover-art cover-variant-${index % 4}`,
            'aria-label': `Decorative cover for ${book.title}`,
            role: 'img'
        },
            h('span', { className: 'cover-mark', 'aria-hidden': true }, '✳'),
            h('span', { className: 'cover-title' }, book.title),
            h('span', { className: 'cover-author' }, book.author || 'The Book Store')
        );
    }

    function BookCard({ book, index }) {
        return h('article', { className: 'book-card' },
            h('a', {
                className: 'book-cover-link',
                href: '/books',
                'aria-label': `Browse ${book.title} in the full book collection`
            }, h(BookCover, { book, index })),
            h('div', { className: 'book-card-content' },
                h('div', { className: 'book-card-meta' },
                    h('span', { className: 'book-category' }, book.category || 'Featured'),
                    h('span', { className: 'book-price' }, `₹${Number(book.price || 0).toLocaleString('en-IN')}`)
                ),
                h('h2', { className: 'book-title' }, book.title),
                h('p', { className: 'book-author' }, `by ${book.author || 'Unknown author'}`),
                h('div', { className: 'category-book-actions' },
                    h('form', { action: `/cart/add/${book._id}`, method: 'post' },
                        h('input', { type: 'hidden', name: 'quantity', value: '1' }),
                        h('button', { className: 'add-to-cart', type: 'submit' }, 'Add to cart')
                    ),
                    h('form', { action: `/cart/buy/${book._id}`, method: 'post' },
                        h('button', { className: 'buy-now', type: 'submit' }, 'Buy now')
                    )
                )
            )
        );
    }

    function CategoryPage() {
        const [query, setQuery] = React.useState('');
        const [sort, setSort] = React.useState('featured');
        const normalizedCategory = selectedCategory.trim().toLocaleLowerCase();
        const visibleBooks = books
            .filter(book => !normalizedCategory || (book.category || '').trim().toLocaleLowerCase() === normalizedCategory)
            .filter(book => `${book.title || ''} ${book.author || ''} ${book.category || ''}`
                .toLocaleLowerCase()
                .includes(query.trim().toLocaleLowerCase()));

        if (sort === 'price-low') {
            visibleBooks.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
        } else if (sort === 'price-high') {
            visibleBooks.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
        } else if (sort === 'title') {
            visibleBooks.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        }

        return h(React.Fragment, null,
            h('section', { className: 'category-hero' },
                h('div', { className: 'hero-inner' },
                    h('div', { className: 'hero-copy' },
                        h('p', { className: 'hero-eyebrow' }, 'A little something for every reader'),
                        h('h1', null, 'Find your next ', h('em', null, 'favorite.')),
                        h('p', { className: 'hero-description' },
                            'Wander through our shelves, follow your curiosity, and meet a story you’ll want to take home.'
                        ),
                        h('a', { className: 'hero-link', href: '#book-shelf' },
                            'Explore the collection',
                            h('span', { 'aria-hidden': true }, ' ↓')
                        )
                    ),
                    h('div', { className: 'hero-art', 'aria-hidden': true },
                        h('div', { className: 'hero-sun' }),
                        h('div', { className: 'hero-book hero-book-back' }),
                        h('div', { className: 'hero-book hero-book-front' },
                            h('span', null, 'THE ART OF'),
                            h('strong', null, 'SLOW'),
                            h('strong', null, 'READING'),
                            h('i', null, 'a bookshop edition')
                        ),
                        h('span', { className: 'hero-sparkle sparkle-one' }, '✳'),
                        h('span', { className: 'hero-sparkle sparkle-two' }, '✦')
                    ),
                    h('div', { className: 'hero-footnote' },
                        h('span', { className: 'hero-dot' }),
                        `${books.length} books waiting to be discovered`
                    )
                )
            ),
            h('section', { id: 'book-shelf', className: 'collection-section' },
                h('div', { className: 'section-heading' },
                    h('div', null,
                        h('p', { className: 'section-eyebrow' }, 'The reading room'),
                        h('h2', null, selectedCategory || 'Explore the shelves')
                    ),
                    h('p', { className: 'section-note' }, 'Good books make the best kind of company.')
                ),
                h('div', { className: 'collection-controls' },
                    h('nav', { className: 'category-filters', 'aria-label': 'Filter books by category' },
                        h('a', {
                            className: `category-chip${!selectedCategory ? ' is-active' : ''}`,
                            href: '/categories',
                            'aria-current': !selectedCategory ? 'page' : undefined
                        }, 'All books'),
                        categories.filter(Boolean).map(category => h('a', {
                            key: category,
                            className: `category-chip${category.toLocaleLowerCase() === normalizedCategory ? ' is-active' : ''}`,
                            href: `/categories/${encodeURIComponent(category)}`,
                            'aria-current': category.toLocaleLowerCase() === normalizedCategory ? 'page' : undefined
                        }, category))
                    ),
                    h('div', { className: 'collection-tools' },
                        h('label', { className: 'search-field' },
                            h('span', { className: 'visually-hidden' }, 'Search books'),
                            h('span', { className: 'search-icon', 'aria-hidden': true }, '⌕'),
                            h('input', {
                                type: 'search',
                                placeholder: 'Search title or author',
                                value: query,
                                onChange: event => setQuery(event.target.value)
                            })
                        ),
                        h('label', { className: 'sort-field' },
                            h('span', { className: 'visually-hidden' }, 'Sort books'),
                            h('select', { value: sort, onChange: event => setSort(event.target.value) },
                                h('option', { value: 'featured' }, 'Featured'),
                                h('option', { value: 'title' }, 'Title: A–Z'),
                                h('option', { value: 'price-low' }, 'Price: low to high'),
                                h('option', { value: 'price-high' }, 'Price: high to low')
                            )
                        )
                    )
                ),
                h('div', { className: 'results-caption', 'aria-live': 'polite' },
                    `${visibleBooks.length} ${visibleBooks.length === 1 ? 'book' : 'books'}`
                ),
                visibleBooks.length
                    ? h('div', { className: 'book-grid' },
                        visibleBooks.map((book, index) => h(BookCard, {
                            key: book._id || `${book.title}-${index}`,
                            book,
                            index
                        }))
                    )
                    : h('div', { className: 'empty-state' },
                        h('span', { className: 'empty-mark', 'aria-hidden': true }, '✳'),
                        h('h3', null, 'No books found just yet'),
                        h('p', null, 'Try another search or choose a different shelf.'),
                        h('button', {
                            className: 'reset-button',
                            type: 'button',
                            onClick: () => setQuery('')
                        }, 'Clear search')
                    )
            ),
            h('footer', { className: 'category-footer' },
                h('span', null, 'Read. Learn. Grow.'),
                h('span', null, '© The Book Store')
            )
        );
    }

    ReactDOM.createRoot(root).render(h(CategoryPage));
})();
