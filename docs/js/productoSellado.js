let currentUser = null;

$(document).ready(async function() {
    await checkSession();

    // --- Navigation & UI ---
    $('#btn-open-add-modal').click(function() {
        resetModal();
        $('#product-modal').addClass('active');
    });

    $('#close-product-modal').click(function() {
        $('#product-modal').removeClass('active');
    });

    $(document).on('click', '#avatar-btn', function(e) {
        e.stopPropagation();
        $('#user-dropdown').toggleClass('active');
    });

    $('#menu-btn-logout').click(function(e) {
        e.preventDefault();
        handleLogout();
    });

    // --- Search Logic ---
    $('#btn-external-search').click(function() {
        searchExternalSets();
    });

    $('#external-search-input').keypress(function(e) {
        if (e.which == 13) searchExternalSets();
    });

    // --- Save Logic ---
    $('#btn-save-product').click(function() {
        saveProduct();
    });

    // Cloudinary Drag & Drop for Product
    $(document).on('drop', '#drop-zone-product', async function(e) {
        e.preventDefault();
        e.stopPropagation();
        const files = e.originalEvent.dataTransfer.files;
        if (files.length > 0) {
            handleCloudinaryUpload(files[0], '#product-image-url', '#drop-zone-product .file-name');
        }
    });

    $(document).on('dragover dragenter', '#drop-zone-product', function(e) {
        e.preventDefault();
        e.stopPropagation();
        $(this).addClass('dragover');
    });

    $(document).on('dragleave dragend drop', '#drop-zone-product', function(e) {
        e.preventDefault();
        e.stopPropagation();
        $(this).removeClass('dragover');
    });

    $(document).on('click', '#drop-zone-product', function() {
        $('#input-product-file').click();
    });

    $(document).on('change', '#input-product-file', function() {
        if (this.files.length > 0) {
            handleCloudinaryUpload(this.files[0], '#product-image-url', '#drop-zone-product .file-name');
        }
    });

    async function handleCloudinaryUpload(file, inputSelector, nameSelector) {
        $(nameSelector).text("Subiendo...").css('color', '#aaa');
        try {
            const url = await CloudinaryUpload.uploadImage(file);
            $(inputSelector).val(url);
            $(nameSelector).text("¡Imagen subida!").css('color', '#00ff88');
            Swal.fire({
                title: '¡Subida Exitosa!',
                text: 'Imagen cargada en Cloudinary',
                icon: 'success',
                timer: 1500,
                showConfirmButton: false,
                toast: true,
                position: 'top-end'
            });
        } catch (err) {
            $(nameSelector).text("Error al subir").css('color', '#ff4757');
            Swal.fire('Error', 'No se pudo subir la imagen: ' + err.message, 'error');
        }
    }
});

async function checkSession() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) {
        const { data: user } = await _supabase
            .from('usuarios')
            .select('id, username, max_sealed')
            .eq('id', session.user.id)
            .single();

        if (user) {
            currentUser = user;
            $('#dropdown-user-name').text(user.username);
            $('#top-panel, #authenticated-content').show();
            loadProducts();
        } else {
            window.location.href = 'admin.html';
        }
    } else {
        window.location.href = 'admin.html';
    }
}

async function handleLogout() {
    await _supabase.auth.signOut();
    window.location.href = 'admin.html';
}

async function loadProducts() {
    $('#product-list').html('<div class="loading">Cargando productos...</div>');

    const { data: products, error } = await _supabase
        .from('sealed_products')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

    if (error) {
        $('#product-list').html('<div class="error">Error al cargar productos.</div>');
        console.error(error);
        return;
    }

    if (!products || products.length === 0) {
        $('#product-list').html('<div class="empty">No tienes productos sellados registrados.</div>');
        return;
    }

    const $container = $('#product-list');
    $container.empty();

    products.forEach(product => {
        const isPublic = product.is_public !== false;
        const $card = $(`
            <div class="album-card">
                <img src="${product.image_url || 'https://via.placeholder.com/300x150?text=Sin+Imagen'}" alt="${product.name}">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
                    <h3 style="margin:0;">${product.name}</h3>
                </div>
                <div style="color: #00d2ff; font-weight: bold;">${product.price || 'Consultar'}</div>
                <div style="font-size: 0.8rem; color: #666; text-transform: uppercase;">${product.tcg}</div>

                <div style="margin-top: 5px; display: flex; align-items: center; gap: 8px;">
                    <label class="switch">
                        <input type="checkbox" class="toggle-public" data-id="${product.id}" ${isPublic ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                    <span style="font-size: 10px; color: #aaa;">${isPublic ? 'Público' : 'Privado'}</span>
                </div>

                <div style="display:flex; gap:10px; margin-top:auto;">
                    <button class="btn btn-edit" data-id="${product.id}">Editar</button>
                    <button class="btn btn-danger btn-delete" data-id="${product.id}">Eliminar</button>
                </div>
            </div>
        `);

        $card.find('.btn-edit').click(() => editProduct(product));
        $card.find('.btn-delete').click(() => deleteProduct(product.id));
        $card.find('.toggle-public').change(function() {
            updateVisibility(product.id, $(this).is(':checked'));
        });

        $container.append($card);
    });
}

let ygoSetsCache = null;
async function getYgoSets() {
    if (ygoSetsCache) return ygoSetsCache;
    try {
        const response = await fetch('https://db.ygoprodeck.com/api/v7/cardsets.php');
        ygoSetsCache = await response.json();
    } catch (e) {
        console.warn("Error fetching YGO sets:", e);
        ygoSetsCache = [];
    }
    return ygoSetsCache;
}

async function searchExternalSets() {
    const query = $('#external-search-input').val().trim().toLowerCase();

    if (query.length < 3) {
        Swal.fire('Atención', 'Por favor, escribe al menos 3 caracteres para buscar.', 'info');
        return;
    }

    $('#external-search-results').html('<div style="grid-column: 1/-1; text-align: center; padding: 10px; color: #666;">Buscando en todas las bases de datos...</div>');

    try {
        const searchPromises = [
            // Yu-Gi-Oh Sets
            getYgoSets(),
            // Yu-Gi-Oh Cards
            fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(query)}`).then(r => r.ok ? r.json() : {data:[]}).catch(() => ({data:[]})),
            // Pokémon Sets
            fetch('https://api.tcgdex.net/v2/en/sets').then(r => r.json()).catch(() => []),
            // Lorcana Sets
            fetch(`https://api.lorcana-api.com/sets/fetch?search=name~${encodeURIComponent(query)}`).then(r => r.json()).catch(() => []),
            // Lorcana Cards
            fetch(`https://api.lorcana-api.com/cards/fetch?search=name~${encodeURIComponent(query)}&displayonly=name;image`).then(r => r.json()).catch(() => []),
            // Viking Search
            VikingData.search(query)
        ];

        const [ygoSets, ygoCards, pkSets, lorSets, lorCards, vikResults] = await Promise.all(searchPromises);

        let combinedResults = [];

        // Process Viking
        if (Array.isArray(vikResults)) {
            combinedResults.push(...vikResults.map(i => ({ ...i, tcg: i.tcg || 'custom' })));
        }

        // Process YGO Sets
        if (Array.isArray(ygoSets)) {
            ygoSets.filter(s => s.set_name.toLowerCase().includes(query)).forEach(s => {
                combinedResults.push({
                    name: s.set_name,
                    image: `https://images.ygoprodeck.com/images/sets/${s.set_code}.jpg`,
                    tcg: 'yugioh'
                });
            });
        }

        // Process YGO Cards
        if (ygoCards.data) {
            ygoCards.data.forEach(c => {
                combinedResults.push({
                    name: c.name,
                    image: c.card_images[0].image_url_small,
                    tcg: 'yugioh'
                });
            });
        }

        // Process PKM Sets
        if (Array.isArray(pkSets)) {
            pkSets.filter(s => s.name.toLowerCase().includes(query)).forEach(s => {
                combinedResults.push({
                    name: s.name,
                    image: `${s.logo}.png`,
                    tcg: 'pokemon'
                });
            });
        }

        // Process Lorcana Sets
        if (Array.isArray(lorSets)) {
            lorSets.forEach(s => {
                combinedResults.push({
                    name: s.Name,
                    image: 'https://lorcana-api.com/img/logo.svg',
                    tcg: 'lorcana'
                });
            });
        }

        // Process Lorcana Cards
        if (Array.isArray(lorCards)) {
            lorCards.forEach(c => {
                combinedResults.push({
                    name: c.Name,
                    image: c.Image,
                    tcg: 'lorcana'
                });
            });
        }

        // Static One Piece
        const opSets = [
            { name: 'Romance Dawn (OP-01)', image: 'https://m.media-amazon.com/images/I/71b2S7A7VWL._AC_SL1500_.jpg', tcg: 'onepiece' },
            { name: 'Paramount War (OP-02)', image: 'https://m.media-amazon.com/images/I/71-0fV5oIIL._AC_SL1500_.jpg', tcg: 'onepiece' },
            { name: 'Pillars of Strength (OP-03)', image: 'https://m.media-amazon.com/images/I/71K6Ew5L9VL._AC_SL1500_.jpg', tcg: 'onepiece' },
            { name: 'Kingdoms of Intrigue (OP-04)', image: 'https://m.media-amazon.com/images/I/71Y8e6lE-KL._AC_SL1500_.jpg', tcg: 'onepiece' },
            { name: 'Awakening of the New Era (OP-05)', image: 'https://m.media-amazon.com/images/I/71f-W-q7GOL._AC_SL1500_.jpg', tcg: 'onepiece' },
            { name: 'Wings of the Captain (OP-06)', image: 'https://m.media-amazon.com/images/I/71Z8I6qG5OL._AC_SL1500_.jpg', tcg: 'onepiece' },
            { name: '500 Years in the Future (OP-07)', image: 'https://m.media-amazon.com/images/I/71H-Z-W-GOL._AC_SL1500_.jpg', tcg: 'onepiece' }
        ];
        opSets.filter(s => s.name.toLowerCase().includes(query)).forEach(s => combinedResults.push(s));

        // Deduplicate
        const unique = [];
        const seen = new Set();
        combinedResults.forEach(i => {
            if (!seen.has(i.image + i.name)) {
                seen.add(i.image + i.name);
                unique.push(i);
            }
        });

        displayExternalResults(unique);
    } catch (e) {
        console.error(e);
        $('#external-search-results').html('<div style="grid-column: 1/-1; text-align: center; padding: 10px; color: #ff4757;">Error al buscar.</div>');
    }
}

function displayExternalResults(results) {
    const $container = $('#external-search-results');
    $container.empty();

    if (results.length === 0) {
        $container.html('<div style="grid-column: 1/-1; text-align: center; padding: 10px; color: #666;">No se encontraron resultados.</div>');
        return;
    }

    results.forEach(item => {
        const $item = $(`
            <div class="external-card-result" title="${item.name}" style="cursor: pointer; transition: transform 0.2s; padding: 5px; border: 1px solid #333; border-radius: 8px; text-align: center;">
                <img src="${item.image}" style="width: 100%; height: 80px; object-fit: contain; border-radius: 4px;" onerror="this.src='https://via.placeholder.com/100x80?text=Set'">
                <div style="font-size: 10px; margin-top: 5px; color: white; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.name}</div>
            </div>
        `);

        $item.hover(
            function() { $(this).css('transform', 'scale(1.1)'); },
            function() { $(this).css('transform', 'scale(1)'); }
        );

        $item.click(() => {
            $('#product-name').val(item.name);
            $('#product-image-url').val(item.image);
            $('#product-tcg').val(item.tcg);
            Swal.fire({
                title: 'Producto Seleccionado',
                text: item.name,
                icon: 'success',
                timer: 1000,
                showConfirmButton: false
            });
        });

        $container.append($item);
    });
}

async function saveProduct() {
    const id = $('#edit-product-id').val();

    // Limit check for new products
    if (!id) {
        const { count, error: countError } = await _supabase
            .from('sealed_products')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', currentUser.id);

        if (!countError) {
            const limit = currentUser.max_sealed || 5;
            if (count >= limit) {
                Swal.fire({
                    title: 'Límite alcanzado',
                    text: `Has alcanzado el límite de ${limit} productos sellados.`,
                    icon: 'warning',
                    footer: '<a href="admin.html">Sube a Premium para aumentar tu límite</a>'
                });
                return;
            }
        }
    }

    const name = $('#product-name').val().trim();
    const imageUrl = $('#product-image-url').val().trim();
    const price = $('#product-price').val().trim();
    const tcg = $('#product-tcg').val();
    const isPublic = $('#product-public').is(':checked');

    if (!name) {
        Swal.fire('Atención', 'El nombre del producto es obligatorio', 'warning');
        return;
    }

    const productData = {
        user_id: currentUser.id,
        name,
        image_url: imageUrl,
        price,
        tcg,
        is_public: isPublic
    };

    let error;
    if (id) {
        const result = await _supabase
            .from('sealed_products')
            .update(productData)
            .eq('id', id);
        error = result.error;
    } else {
        const result = await _supabase
            .from('sealed_products')
            .insert([productData]);
        error = result.error;
    }

    if (error) {
        Swal.fire('Error', 'No se pudo guardar el producto: ' + error.message, 'error');
    } else {
        // Save to VikingData
        VikingData.save({
            ...productData,
            type: 'product'
        });

        Swal.fire('Guardado', 'Producto actualizado correctamente', 'success');
        $('#product-modal').removeClass('active');
        loadProducts();
    }
}

function editProduct(product) {
    resetModal();
    $('#modal-title').text('Editar Producto');
    $('#edit-product-id').val(product.id);
    $('#product-name').val(product.name);
    $('#product-image-url').val(product.image_url);
    $('#product-price').val(product.price);
    $('#product-tcg').val(product.tcg);
    $('#product-public').prop('checked', product.is_public !== false);

    $('#product-modal').addClass('active');
}

async function deleteProduct(id) {
    const result = await Swal.fire({
        title: '¿Eliminar producto?',
        text: "Esta acción no se puede deshacer",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ff4757',
        confirmButtonText: 'Sí, eliminar'
    });

    if (result.isConfirmed) {
        const { error } = await _supabase.from('sealed_products').delete().eq('id', id);
        if (error) {
            Swal.fire('Error', 'No se pudo eliminar el producto', 'error');
        } else {
            loadProducts();
        }
    }
}

async function updateVisibility(id, isPublic) {
    const { error } = await _supabase
        .from('sealed_products')
        .update({ is_public: isPublic })
        .eq('id', id);

    if (error) {
        Swal.fire('Error', 'No se pudo actualizar la visibilidad', 'error');
    }
}


function resetModal() {
    $('#modal-title').text('Añadir Producto Sellado');
    $('#edit-product-id').val('');
    $('#product-name').val('');
    $('#product-image-url').val('');
    $('#drop-zone-product .file-name').text('');
    $('#product-price').val('');
    $('#product-tcg').val('yugioh');
    $('#product-public').prop('checked', true);
    $('#external-search-input').val('');
    $('#external-search-results').empty();
}
