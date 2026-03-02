let currentAlbumId = null;
let currentDeckId = null;
let deckSortOrder = 'position';

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

let currentDeckCardId = null; // New for deck card editing
let currentSlotIndex = null;
let currentPageId = null;
let currentUser = null;
let editingType = 'slot'; // 'slot' or 'deck-card'

// Mask Editor State
let maskCanvas, maskCtx;
let isPainting = false;
let currentBrushSize = 10;
let currentTool = 'brush'; // 'brush' or 'eraser'
let maskHistory = [];
const MAX_HISTORY = 20;

let droppedGltfFile = null;
let droppedExtraFiles = [];

$(document).ready(async function() {
    await checkSession();
    initTheme();

    // --- Navigation (Dashboard Tiles) ---
    $(document).on('click', '#btn-home', function(e) {
        e.preventDefault();
        showView('main-dashboard');
    });

    $(document).on('click', '#btn-show-albums', function(e) {
        e.preventDefault();
        showView('dashboard');
        loadAlbums();
    });

    $(document).on('click', '#btn-back-to-decks', function(e) {
        e.preventDefault();
        showView('decks');
        loadDecks();
    });


    $(document).on('click', '#btn-show-decks', function(e) {
        e.preventDefault();
        showView('decks');
        loadDecks();
    });

    $(document).on('click', '#btn-show-spirits', function(e) {
        e.preventDefault();
        showView('spirits');
        loadSpirits();
    });

    $(document).on('click', '#btn-chatbot-config', function(e) {
        e.preventDefault();
        showView('chatbot-config');
        loadBotMessages();
    });

    $(document).on('click', '#btn-logout-tile', function(e) {
        e.preventDefault();
        handleLogout();
    });

    // --- Floating Panel Logic ---
    $(document).on('click', '#avatar-btn', function(e) {
        e.stopPropagation();
        $('#user-dropdown').toggleClass('active');
    });

    $(document).on('click', function(e) {
        if (!$(e.target).closest('.user-menu-container').length) {
            $('#user-dropdown').removeClass('active');
        }
    });

    $(document).on('click', '.theme-btn, .theme-btn-small', function() {
        const theme = $(this).data('theme');
        applyTheme(theme);
    });

    // Special Price Toggle
    $(document).on('change', '#input-deck-use-special', function() {
        if ($(this).is(':checked')) {
            $('#special-price-container').show();
        } else {
            $('#special-price-container').hide();
        }
    });

    // --- Chatbot Logic ---
    const faqResponses = {
        'album': 'Para crear un álbum, haz clic en "Crear Nuevo Álbum" en esta misma pantalla. Luego puedes entrar a "Editar" para añadir páginas y cartas.',
        'add_card': 'Para añadir cartas, entra en "Mis Álbumes", selecciona "Editar" y haz clic en cualquier espacio vacío para abrir el buscador.',
        'scanner': 'El scanner te permite añadir cartas rápidamente usando la cámara de tu móvil. Escanea el código de la carta y se añadirá automáticamente a tu álbum o deck.',
        'notifications': 'En la sección "Mi Perfil", puedes configurar tus enlaces de WhatsApp y Messenger. Esto permitirá que los pedidos de tus clientes lleguen directamente a tu chat.',
        'foil': 'Al editar una carta, selecciona el efecto "CustomTexture". Luego haz clic en "Editar Máscara" para dibujar exactamente qué partes de la carta tendrán el brillo foil.',
        'wishlist_faq': 'La sección "Deseos" te permite listar cartas que estás buscando. Tus clientes podrán ver esta lista y contactarte si tienen alguna de ellas.',
        'theme': 'Puedes cambiar el tema (Claro, Medio, Oscuro) usando los iconos en la esquina superior izquierda de la pantalla.',
        'spirit': 'El compañero es tu asistente virtual que acompaña a tus clientes mientras navegan. Sirve para mostrar mensajes automáticos sobre próximas preventas, horarios, noticias de la tienda y ubicación, además de funcionar como una guía interactiva para navegar por tu web.',
        'deck_prices': 'Ahora puedes gestionar los precios de tus Decks. El sistema suma automáticamente el precio de cada carta para mostrar un "Precio Total". Si lo deseas, puedes habilitar un "Precio Especial" (por ejemplo, un descuento por el deck completo) que se mostrará como el precio principal, tachando el total automático.'
    };

    window.addChatMessage = function(sender, text) {
        const $container = $('#chat-messages');
        const $msg = $(`<div class="chat-msg msg-${sender}"></div>`).text(text);
        $container.append($msg);
        $container.scrollTop($container[0].scrollHeight);
    };

    $('#send-chat').click(function() {
        const text = $('#chat-input').val().trim();
        if (!text) return;
        addChatMessage('user', text);
        $('#chat-input').val('');
        setTimeout(() => {
            addChatMessage('bot', 'Aún estoy aprendiendo a responder mensajes libres. Por favor, usa los botones de preguntas frecuentes para obtener ayuda inmediata.');
        }, 800);
    });

    $('#chat-input').keypress(function(e) {
        if (e.which == 13) $('#send-chat').click();
    });

    $('.faq-btn').click(function() {
        const faq = $(this).data('faq');
        const question = $(this).text();
        const answer = faqResponses[faq];

        addChatMessage('user', question);
        setTimeout(() => {
            addChatMessage('bot', answer);
        }, 500);
    });

    $('#close-chatbot').click(function() {
        $('#chatbot-container').removeClass('active');
    });

    // --- Companion Menu Logic ---
    $(document).on('click', function(e) {
        if (!$(e.target).closest('#floating-companion-container, #companion-menu').length) {
            $('#companion-menu').removeClass('active');
        }
    });

    $('#menu-item-chat').click(function() {
        $('#chatbot-container').addClass('active');
        $('#companion-menu').removeClass('active');
    });

    $('#menu-item-details').click(function() {
        if (window.currentSpirit) {
            Swal.fire({
                title: window.currentSpirit.name,
                html: `<model-viewer src="${window.currentSpirit.gltf_url}" auto-rotate camera-controls style="width:100%; height:300px; background:#000; border-radius:15px;"></model-viewer>`,
                showCloseButton: true,
                showConfirmButton: false
            });
        }
        $('#companion-menu').removeClass('active');
    });

    $('#menu-btn-home').click(function(e) { e.preventDefault(); showView('main-dashboard'); $('#user-dropdown').removeClass('active'); });
    $('#menu-btn-albums').click(function(e) { e.preventDefault(); showView('dashboard'); loadAlbums(); $('#user-dropdown').removeClass('active'); });
    $('#menu-btn-decks').click(function(e) { e.preventDefault(); showView('decks'); loadDecks(); $('#user-dropdown').removeClass('active'); });
    $('#menu-btn-spirits').click(function(e) { e.preventDefault(); showView('spirits'); loadSpirits(); $('#user-dropdown').removeClass('active'); });
    $('#menu-btn-logout').click(function(e) { e.preventDefault(); handleLogout(); });

    // --- Upgrade Button Logic ---
    $(document).on('click', '#btn-upgrade-plan', function(e) {
        e.preventDefault();
        Swal.fire({
            title: '<span style="color: #00d2ff;">¡Sube a Premium!</span>',
            html: `
                <div style="text-align: left; color: #eee; font-size: 0.95rem; line-height: 1.6;">
                    <p>¿Te gustaría aumentar el potencial de tu tienda? Estos son los beneficios del plan <strong>Premium</strong>:</p>
                    <ul style="list-style-type: none; padding-left: 0; margin-top: 15px;">
                        <li style="margin-bottom: 8px;"><i class="fas fa-check-circle" style="color: #00d2ff; margin-right: 10px;"></i> Hasta <strong>5 álbumes</strong> activos.</li>
                        <li style="margin-bottom: 8px;"><i class="fas fa-check-circle" style="color: #00d2ff; margin-right: 10px;"></i> Hasta <strong>10 páginas</strong> por álbum.</li>
                        <li style="margin-bottom: 8px;"><i class="fas fa-check-circle" style="color: #00d2ff; margin-right: 10px;"></i> Hasta <strong>5 decks</strong> personalizados.</li>
                        <li style="margin-bottom: 8px;"><i class="fas fa-check-circle" style="color: #00d2ff; margin-right: 10px;"></i> Hasta <strong>50 cartas</strong> en Deseos.</li>
                        <li style="margin-bottom: 8px;"><i class="fas fa-check-circle" style="color: #00d2ff; margin-right: 10px;"></i> Hasta <strong>20 productos</strong> sellados.</li>
                        <li style="margin-bottom: 8px;"><i class="fas fa-check-circle" style="color: #00d2ff; margin-right: 10px;"></i> Hasta <strong>5 preventas</strong> activas.</li>
                        <li style="margin-bottom: 8px;"><i class="fas fa-check-circle" style="color: #00d2ff; margin-right: 10px;"></i> Gestión de hasta <strong>10 clientes</strong>.</li>
                        <li style="margin-bottom: 8px;"><i class="fas fa-check-circle" style="color: #00d2ff; margin-right: 10px;"></i> Gestión de hasta <strong>15 subastas</strong>.</li>
                        <li style="margin-bottom: 8px;"><i class="fas fa-check-circle" style="color: #00d2ff; margin-right: 10px;"></i> Gestión de hasta <strong>5 eventos</strong>.</li>
                        <li style="margin-bottom: 8px;"><i class="fas fa-check-circle" style="color: #00d2ff; margin-right: 10px;"></i> Acceso a <strong>todos los compañeros</strong>.</li>
                        <li style="margin-bottom: 8px;"><i class="fas fa-check-circle" style="color: #00d2ff; margin-right: 10px;"></i> Soporte prioritario.</li>
                    </ul>
                    <p style="margin-top: 20px; text-align: center; font-weight: bold;">Haz clic abajo para contactarnos y solicitar tu upgrade:</p>
                </div>
            `,
            icon: 'info',
            showCancelButton: true,
            confirmButtonText: '<i class="fab fa-facebook-messenger"></i> Contactar por Messenger',
            cancelButtonText: 'Tal vez luego',
            confirmButtonColor: '#0084ff',
            cancelButtonColor: '#333',
            background: '#1a1a1a',
            color: '#fff'
        }).then((result) => {
            if (result.isConfirmed) {
                window.open('https://m.me/vikingdevtj', '_blank');
            }
        });
    });

    // --- Back Buttons ---
    $(document).on('click', '#btn-back-to-main, .btn-back-main', function(e) {
        e.preventDefault();
        showView('main-dashboard');
    });

    $(document).on('click', '#btn-back-to-albums', function(e) {
        e.preventDefault();
        showView('dashboard');
        loadAlbums();
    });

    // Zoom Toggle (Admin)
    // Spirit Navigation
    $('#btn-prev-spirit-admin').click(function() {
        if (!window.allSpirits || window.allSpirits.length <= 1) return;
        window.currentSpiritIndex = (window.currentSpiritIndex - 1 + window.allSpirits.length) % window.allSpirits.length;
        updateMainViewer(window.allSpirits[window.currentSpiritIndex], window.selectedSpiritId);
    });

    $('#btn-next-spirit-admin').click(function() {
        if (!window.allSpirits || window.allSpirits.length <= 1) return;
        window.currentSpiritIndex = (window.currentSpiritIndex + 1) % window.allSpirits.length;
        updateMainViewer(window.allSpirits[window.currentSpiritIndex], window.selectedSpiritId);
    });

    $('#btn-toggle-zoom-admin').on('click', function() {
        const viewer = document.getElementById('main-spirit-viewer');
        const icon = $(this).find('i');

        if (viewer.hasAttribute('disable-zoom')) {
            viewer.removeAttribute('disable-zoom');
            icon.removeClass('fa-search-plus').addClass('fa-search-minus');
            $(this).css('background', 'rgba(0, 210, 255, 0.6)');
            Swal.fire({
                title: 'Zoom Activado',
                text: 'Ahora puedes usar la rueda del ratón o pellizcar para hacer zoom.',
                icon: 'info',
                timer: 1500,
                showConfirmButton: false,
                toast: true,
                position: 'top-end'
            });
        } else {
            viewer.setAttribute('disable-zoom', '');
            icon.removeClass('fa-search-minus').addClass('fa-search-plus');
            $(this).css('background', 'rgba(0,0,0,0.5)');
        }
    });

    // Authentication Actions
    $('#btn-login').click(function(e) {
        e.preventDefault();
        handleLogin();
    });
    $('#btn-logout').click(function(e) {
        e.preventDefault();
        handleLogout();
    });

    // Navigation
    $('#btn-dashboard').click(function(e) {
        e.preventDefault();
        showView('dashboard');
        loadAlbums();
    });

    $('#btn-decks').click(function(e) {
        e.preventDefault();
        showView('decks');
        loadDecks();
    });

    $('#btn-spirits').click(function(e) {
        e.preventDefault();
        showView('spirits');
        loadSpirits();
    });

    $('#btn-create-album').click(async function(e) {
        e.preventDefault();
        if (!currentUser) return;

        // Limite de álbumes
        const { count } = await _supabase
            .from('albums')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', currentUser.id);

        if (count >= (currentUser.max_albums || 3)) {
            Swal.fire('Límite alcanzado', `Tu plan actual permite un máximo de ${currentUser.max_albums || 3} álbumes.`, 'warning');
            return;
        }

        const { data, error } = await _supabase
            .from('albums')
            .insert([{ title: 'Nuevo Álbum', user_id: currentUser.id }])
            .select();

        if (error) {
            Swal.fire('Error', 'No se pudo crear el álbum', 'error');
            console.error(error);
        } else {
            loadAlbums();
        }
    });

    // Album Meta Save
    $('#btn-save-album-meta').click(async function(e) {
        e.preventDefault();
        const title = $('#input-album-title').val();
        const cover = $('#input-album-cover').val();
        const back = $('#input-album-back').val();
        const coverColor = $('#input-album-cover-color').val();
        const backColor = $('#input-album-back-color').val();
        const is_public = $('#input-album-public').is(':checked');

        let updateData = {
            title,
            cover_image_url: cover,
            back_image_url: back,
            cover_color: coverColor,
            back_color: backColor,
            is_public
        };
        let { error } = await _supabase
            .from('albums')
            .update(updateData)
            .eq('id', currentAlbumId);

        // Fallback for missing column
        if (error && (error.code === '42703' || (error.message && error.message.includes('is_public')))) {
            console.warn("is_public column missing, retrying update without it.");
            delete updateData.is_public;
            const retry = await _supabase
                .from('albums')
                .update(updateData)
                .eq('id', currentAlbumId);
            error = retry.error;
        }

        if (error) {
            Swal.fire('Error', 'No se pudieron guardar los cambios: ' + (error.message || ''), 'error');
            console.error(error);
        } else {
            Swal.fire({
                title: '¡Actualizado!',
                text: 'El álbum se ha actualizado correctamente',
                icon: 'success',
                timer: 2000,
                showConfirmButton: false
            });
            loadAlbums();
            showView('dashboard');
        }
    });

    // Page Management
    $('#btn-add-page, #btn-add-page-bottom').click(async function(e) {
        e.preventDefault();

        // Limite de páginas por álbum
        const { count } = await _supabase
            .from('pages')
            .select('*', { count: 'exact', head: true })
            .eq('album_id', currentAlbumId);

        if (count >= (currentUser.max_pages || 5)) {
            Swal.fire('Límite alcanzado', `Tu plan actual permite un máximo de ${currentUser.max_pages || 5} páginas por álbum.`, 'warning');
            return;
        }

        const { data: pages } = await _supabase
            .from('pages')
            .select('page_index')
            .eq('album_id', currentAlbumId)
            .order('page_index', { ascending: false })
            .limit(1);

        const nextIndex = (pages && pages.length > 0) ? pages[0].page_index + 1 : 0;

        const { data, error } = await _supabase
            .from('pages')
            .insert([{ album_id: currentAlbumId, page_index: nextIndex }])
            .select();

        if (error) {
            Swal.fire('Error', 'No se pudo añadir la página', 'error');
            console.error(error);
        } else {
            loadAlbumPages(currentAlbumId, false);
        }
    });

    // Slot Management
    $(document).on('click', '.card-slot', function() {
        currentPageId = $(this).closest('.admin-page-item').data('id');
        currentSlotIndex = $(this).data('index');
        loadSlotData(currentPageId, currentSlotIndex);
    });

    $('#btn-save-slot').click(async function(e) {
        e.preventDefault();
        const imageUrl = $('#slot-image-url').val();

        if (!imageUrl) {
            Swal.fire('Atención', 'La URL de la imagen es obligatoria.', 'warning');
            return;
        }

        let holoEffect = $('#slot-holo-effect').val() || '';
        if (holoEffect === 'custom-foil') {
            const subType = $('#slot-custom-foil-type').val() || 'foil';
            holoEffect = `custom-foil|${subType}`;
        }

        const cardData = {
            image_url: imageUrl,
            name: $('#slot-name').val() || '',
            holo_effect: holoEffect,
            custom_mask_url: $('#slot-custom-mask').val() || '',
            rarity: $('#slot-rarity').val() || '',
            expansion: $('#slot-expansion').val() || '',
            condition: $('#slot-condition').val() || 'M',
            quantity: parseInt($('#slot-quantity').val()) || 1,
            price: $('#slot-price').val() || ''
        };

        // Save to VikingData (Shared Database)
        VikingData.save({
            ...cardData,
            tcg: 'custom',
            type: 'card',
            user_id: currentUser.id
        });

        let error;
        if (editingType === 'slot') {
            const slotData = { ...cardData, page_id: currentPageId, slot_index: currentSlotIndex };
            const result = await _supabase
                .from('card_slots')
                .upsert(slotData, { onConflict: 'page_id,slot_index' });
            error = result.error;
        } else {
            const result = await _supabase
                .from('deck_cards')
                .update(cardData)
                .eq('id', currentDeckCardId);
            error = result.error;
        }

        if (error) {
            Swal.fire('Error', 'No se pudo guardar la información de la carta: ' + (error.message || ''), 'error');
            console.error(error);
        } else {
            Swal.fire({
                title: 'Guardado',
                text: 'Carta actualizada',
                icon: 'success',
                timer: 1500,
                showConfirmButton: false
            });
            $('#slot-modal').removeClass('active');
            window.card3dActive = false;
            if (editingType === 'slot') {
                loadAlbumPages(currentAlbumId);
            } else {
                loadDeckCards(currentDeckId);
            }
        }
    });

    $('#btn-add-to-cart').click(function(e) {
        e.preventDefault();
        const cardData = {
            image_url: $('#slot-image-url').val(),
            name: $('#slot-name').val(),
            rarity: $('#slot-rarity').val(),
            expansion: $('#slot-expansion').val(),
            price: $('#slot-price').val()
        };

        if (!cardData.name || !cardData.image_url) {
            Swal.fire('Atención', 'La carta debe tener al menos nombre e imagen para añadirla al carrito.', 'warning');
            return;
        }

        if (typeof Cart !== 'undefined') {
            Cart.add(cardData);
            Swal.fire({
                title: '¡Añadido!',
                text: `${cardData.name} se ha añadido al carrito.`,
                icon: 'success',
                timer: 1500,
                showConfirmButton: false,
                toast: true,
                position: 'top-end'
            });
        }
    });

    $('#close-slot-modal').click(function() {
        $('#slot-modal').removeClass('active');
        window.card3dActive = false;
    });

    $('#slot-holo-effect').change(function() {
        const val = $(this).val();
        if (val === 'custom-texture' || val === 'custom-foil') {
            $('#custom-mask-container').show();
        } else {
            $('#custom-mask-container').hide();
        }

        if (val === 'custom-foil') {
            $('#custom-foil-type-container').show();
        } else {
            $('#custom-foil-type-container').hide();
        }
    });

    // --- Mask Editor Logic ---
    maskCanvas = document.getElementById('mask-canvas');
    if (maskCanvas) maskCtx = maskCanvas.getContext('2d');

    $('#btn-open-mask-editor').click(function(e) {
        e.preventDefault();
        const cardImgUrl = $('#slot-image-url').val();
        if (!cardImgUrl) {
            Swal.fire('Atención', 'Primero debes poner la URL de la imagen de la carta para usar de referencia.', 'warning');
            return;
        }

        // Set card as background
        $('#mask-canvas-wrapper').css('background-image', `url(${cardImgUrl})`);

        // Initialize canvas
        initMaskCanvas();

        $('#mask-editor-overlay').addClass('active');
    });

    $('#close-mask-editor').click(function() {
        $('#mask-editor-overlay').removeClass('active');
    });

    $('#brush-size').on('input', function() {
        currentBrushSize = $(this).val();
        $('#brush-size-val').text(currentBrushSize);
    });

    $('#tool-brush').click(function() {
        currentTool = 'brush';
        $('.editor-controls .btn-secondary').removeClass('active');
        $(this).addClass('active');
    });

    $('#tool-eraser').click(function() {
        currentTool = 'eraser';
        $('.editor-controls .btn-secondary').removeClass('active');
        $(this).addClass('active');
    });

    $('#btn-clear-mask').click(function() {
        Swal.fire({
            title: '¿Limpiar todo?',
            text: "Se borrará todo el dibujo de la máscara.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, limpiar'
        }).then((result) => {
            if (result.isConfirmed) {
                saveMaskHistory();
                maskCtx.fillStyle = 'black';
                maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
                // Also clear the input field as requested
                $('#slot-custom-mask').val('');
            }
        });
    });

    $('#btn-undo-mask').click(function() {
        if (maskHistory.length > 0) {
            const lastState = maskHistory.pop();
            const img = new Image();
            img.onload = function() {
                maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
                maskCtx.drawImage(img, 0, 0);
            };
            img.src = lastState;
        }
    });

    $('#btn-save-mask').click(function() {
        // Save canvas as base64
        const dataUrl = maskCanvas.toDataURL('image/png');
        $('#slot-custom-mask').val(dataUrl);
        $('#mask-editor-overlay').removeClass('active');
        Swal.fire('Guardado', 'La máscara se ha generado correctamente. No olvides guardar la carta para aplicar los cambios.', 'success');
    });

    // --- External Search Logic ---
    $('#btn-external-search').click(function(e) {
        e.preventDefault();
        searchExternalCard('#external-search-input', '#external-search-results', function(card) {
            $('#slot-name').val(card.name);
            $('#slot-image-url').val(card.high_res);
            Swal.fire({
                title: 'Carta Seleccionada',
                text: card.name,
                icon: 'success',
                timer: 1000,
                showConfirmButton: false
            });
        });
    });

    $('#external-search-input').keypress(function(e) {
        if (e.which == 13) {
            e.preventDefault();
            $('#btn-external-search').click();
        }
    });

    // Deck Search Listeners
    $(document).on('click', '#btn-deck-external-search', function(e) {
        e.preventDefault();
        searchExternalCard('#deck-external-search-input', '#deck-external-search-results', async function(card) {
            // Limite de cartas por deck
            const { count } = await _supabase.from('deck_cards').select('*', { count: 'exact', head: true }).eq('deck_id', currentDeckId);
            if (count >= (currentUser.max_cards_per_deck || 60)) {
                Swal.fire('Límite alcanzado', `Este deck ya tiene el máximo de ${currentUser.max_cards_per_deck || 60} cartas permitidas.`, 'warning');
                return;
            }

            // Immediate add to deck
            const { error } = await _supabase
                .from('deck_cards')
                .insert([{
                    deck_id: currentDeckId,
                    image_url: card.high_res,
                    name: card.name
                }]);

            if (error) {
                Swal.fire('Error', 'No se pudo añadir la carta al deck', 'error');
            } else {
                Swal.fire({
                    title: '¡Añadida!',
                    text: card.name,
                    icon: 'success',
                    timer: 1000,
                    showConfirmButton: false
                });
                loadDeckCards(currentDeckId);
            }
        });
    });

    $(document).on('keypress', '#deck-external-search-input', function(e) {
        if (e.which == 13) {
            e.preventDefault();
            $('#btn-deck-external-search').click();
        }
    });

    async function searchExternalCard(inputSelector, resultsSelector, onSelectCallback) {
        const query = $(inputSelector).val().trim();

        if (query.length < 3) {
            Swal.fire('Atención', 'Por favor, escribe al menos 3 caracteres para buscar.', 'info');
            return;
        }

        $(resultsSelector).html('<div style="grid-column: 1/-1; text-align: center; padding: 10px; color: #666;">Buscando en todas las bases de datos...</div>');

        try {
            // Special YGO search logic for passcodes and set codes
            const ygoSpecialSearch = async () => {
                const q = query.toUpperCase();
                // Passcode (Numeric 5-10 digits)
                if (/^\d{5,10}$/.test(q)) {
                    const r = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${q}`).then(res => res.json()).catch(() => ({data:[]}));
                    return r.data || [];
                }
                // Set Code (Format XXX-123 or XXX-EN123)
                const setMatch = q.match(/^([A-Z0-9]{3,6})-([A-Z0-9]{3,8})$/);
                if (setMatch) {
                    const prefix = setMatch[1];
                    const sets = await getYgoSets();
                    const setObj = sets.find(s => s.set_code.toUpperCase() === prefix);
                    if (setObj) {
                        const r = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?cardset=${encodeURIComponent(setObj.set_name)}`).then(res => res.json()).catch(() => ({data:[]}));
                        if (r.data) {
                            // Filter for the exact set code
                            return r.data.filter(c => c.card_sets && c.card_sets.some(s => s.set_code.toUpperCase() === q));
                        }
                    }
                }
                return [];
            };

            // Concurrent search across all databases (Yu-Gi-Oh and Pokémon in 3 languages)
            const searchPromises = [
                // Yu-Gi-Oh! Name Search
                fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(query)}`).then(r => r.ok ? r.json() : {data:[]}).catch(() => ({data:[]})),
                // Yu-Gi-Oh! Code/Set Search
                fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?cardset=${encodeURIComponent(query)}`).then(r => r.ok ? r.json() : {data:[]}).catch(() => ({data:[]})),
                // Special YGO Search
                ygoSpecialSearch(),
                // Pokémon TCGdex - English
                fetch(`https://api.tcgdex.net/v2/en/cards?name=${encodeURIComponent(query)}`).then(r => r.ok ? r.json() : []).catch(() => []),
                // Pokémon TCGdex - Spanish
                fetch(`https://api.tcgdex.net/v2/es/cards?name=${encodeURIComponent(query)}`).then(r => r.ok ? r.json() : []).catch(() => []),
                // Pokémon TCGdex - Japanese
                fetch(`https://api.tcgdex.net/v2/ja/cards?name=${encodeURIComponent(query)}`).then(r => r.ok ? r.json() : []).catch(() => []),
                // Lorcana Search
                fetch(`https://api.lorcana-api.com/cards/fetch?search=name~${encodeURIComponent(query)}&displayonly=name;image;cost;set_num`).then(r => r.ok ? r.json() : []).catch(() => []),
                // Viking Search
                VikingData.search(query)
            ];

            const [ygName, ygCode, ygSpecial, pkEn, pkEs, pkJa, lorResults, vikResults] = await Promise.all(searchPromises);

            let combinedResults = [];

            // Process VikingData
            if (Array.isArray(vikResults)) {
                combinedResults.push(...vikResults);
            }

            // Process Lorcana Results
            const lorResultsSafe = Array.isArray(lorResults) ? lorResults : [];
            lorResultsSafe.forEach(c => {
                if (c.Image) {
                    combinedResults.push({
                        name: c.Name,
                        image: c.Image,
                        high_res: c.Image
                    });
                }
            });

            // Process Yu-Gi-Oh Results
            const ygoResults = [...(ygName.data || []), ...(ygCode.data || []), ...ygSpecial];
            ygoResults.forEach(c => {
                if (c.card_images && c.card_images.length > 0) {
                    // Iterate through all alternate arts
                    c.card_images.forEach(img => {
                        combinedResults.push({
                            name: c.name,
                            image: img.image_url_small,
                            high_res: img.image_url
                        });
                    });
                }
            });

            // Process Pokémon Results
            const pkResults = [...(pkEn || []), ...(pkEs || []), ...(pkJa || [])];
            pkResults.forEach(c => {
                if (c.image) {
                    combinedResults.push({
                        name: c.name,
                        image: `${c.image}/low.webp`,
                        high_res: `${c.image}/high.webp`
                    });
                }
            });

            // Deduplicate by Image URL
            const uniqueResults = [];
            const seenImages = new Set();
            combinedResults.forEach(card => {
                if (!seenImages.has(card.image)) {
                    seenImages.add(card.image);
                    uniqueResults.push(card);
                }
            });

            if (uniqueResults.length === 0) {
                $(resultsSelector).html('<div style="grid-column: 1/-1; text-align: center; padding: 10px; color: #ff4757;">No se encontraron cartas en ninguna base de datos.</div>');
            } else {
                displayExternalResults(uniqueResults.slice(0, 50), resultsSelector, onSelectCallback);
            }

        } catch (err) {
            console.error(err);
            $(resultsSelector).html('<div style="grid-column: 1/-1; text-align: center; padding: 10px; color: #ff4757;">Error al buscar. Inténtalo de nuevo.</div>');
        }
    }

    function displayExternalResults(results, resultsSelector, onSelectCallback) {
        const $container = $(resultsSelector);
        $container.empty();

        if (results.length === 0) {
            $container.html('<div style="grid-column: 1/-1; text-align: center; padding: 10px; color: #666;">No se encontraron resultados.</div>');
            return;
        }

        results.forEach(card => {
            const $item = $(`
                <div class="external-card-result" title="${card.name}" style="cursor: pointer; transition: transform 0.2s;">
                    <img src="${card.image}" style="width: 100%; border-radius: 4px; border: 1px solid #333;">
                </div>
            `);

            $item.hover(
                function() { $(this).css('transform', 'scale(1.1)'); },
                function() { $(this).css('transform', 'scale(1)'); }
            );

            $item.click(function() {
                onSelectCallback(card);
            });

            $container.append($item);
        });
    }

    // Canvas Events
    $(maskCanvas).on('mousedown touchstart', function(e) {
        isPainting = true;
        saveMaskHistory();
        draw(e);
    });

    $(window).on('mousemove touchmove', function(e) {
        if (isPainting) draw(e);
    });

    $(window).on('mouseup touchend', function() {
        isPainting = false;
        maskCtx.beginPath();
    });

    function initMaskCanvas() {
        const currentMask = $('#slot-custom-mask').val();

        // Fill black background first
        maskCtx.fillStyle = 'black';
        maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

        if (currentMask) {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = function() {
                maskCtx.drawImage(img, 0, 0, maskCanvas.width, maskCanvas.height);
            };
            img.onerror = function() {
                console.warn("No se pudo cargar la máscara previa en el lienzo (puede ser por CORS).");
            };
            img.src = currentMask;
        }

        maskHistory = [];
    }

    function saveMaskHistory() {
        if (maskHistory.length >= MAX_HISTORY) maskHistory.shift();
        maskHistory.push(maskCanvas.toDataURL());
    }

    function draw(e) {
        if (!isPainting) return;

        const rect = maskCanvas.getBoundingClientRect();
        let x, y;

        if (e.type.includes('touch')) {
            const touch = e.originalEvent.touches[0] || e.originalEvent.changedTouches[0];
            x = touch.clientX - rect.left;
            y = touch.clientY - rect.top;
            e.preventDefault();
        } else {
            x = e.clientX - rect.left;
            y = e.clientY - rect.top;
        }

        // Scale coordinates if canvas display size is different from actual size
        x = x * (maskCanvas.width / rect.width);
        y = y * (maskCanvas.height / rect.height);

        maskCtx.lineWidth = currentBrushSize;
        maskCtx.lineCap = 'round';
        maskCtx.lineJoin = 'round';
        maskCtx.strokeStyle = currentTool === 'brush' ? 'white' : 'black';

        maskCtx.lineTo(x, y);
        maskCtx.stroke();
        maskCtx.beginPath();
        maskCtx.moveTo(x, y);
    }

    // Deck Management Actions
    $('#btn-create-deck').click(async function(e) {
        e.preventDefault();
        if (!currentUser) return;

        // Limite de decks
        const { count } = await _supabase
            .from('decks')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', currentUser.id);

        if (count >= (currentUser.max_decks || 1)) {
            Swal.fire('Límite alcanzado', `Tu plan actual permite un máximo de ${currentUser.max_decks || 1} deck.`, 'warning');
            return;
        }

        const { data, error } = await _supabase
            .from('decks')
            .insert([{ name: 'Nuevo Deck', user_id: currentUser.id }])
            .select();

        if (error) {
            Swal.fire('Error', 'No se pudo crear el deck', 'error');
        } else {
            loadDecks();
        }
    });


    $('#btn-save-deck-meta').click(async function(e) {
        e.preventDefault();
        const name = $('#input-deck-name').val();
        const is_public = $('#input-deck-public').is(':checked');
        const use_special_price = $('#input-deck-use-special').is(':checked');
        const special_price = $('#input-deck-special-price').val();

        let updateData = { name, is_public, use_special_price, special_price };
        let { error } = await _supabase
            .from('decks')
            .update(updateData)
            .eq('id', currentDeckId);

        // Fallback for missing columns
        if (error && error.code === '42703') {
            console.warn("Some columns might be missing, retrying update with basic fields.");
            const basicData = { name, is_public };
            const retry = await _supabase
                .from('decks')
                .update(basicData)
                .eq('id', currentDeckId);
            error = retry.error;
        }

        if (error) {
            Swal.fire('Error', 'No se pudo actualizar el deck: ' + (error.message || ''), 'error');
            console.error(error);
        } else {
            Swal.fire('¡Éxito!', 'Nombre del deck actualizado', 'success');
            loadDecks();
        }
    });


    // --- Spirit Management ---
    function updateDropZoneUI(zoneId, files) {
        const $zone = $(`#${zoneId}`);
        const $fileName = $zone.find('.file-name');
        if (files && files.length > 0) {
            if (files.length === 1) {
                $fileName.text(files[0].name);
            } else {
                $fileName.text(`${files.length} archivos seleccionados`);
            }
            $zone.find('p').hide();
        } else {
            $fileName.text('');
            $zone.find('p').show();
        }
    }

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    $(document).on('dragover dragenter', '.drop-zone', function(e) {
        handleDrag(e);
        $(this).addClass('drag-over');
        if ($(this).hasClass('file-drop-zone')) $(this).addClass('dragover');
    });

    $(document).on('dragleave dragend drop', '.drop-zone', function(e) {
        handleDrag(e);
        $(this).removeClass('drag-over');
        if ($(this).hasClass('file-drop-zone')) $(this).removeClass('dragover');
    });

    $(document).on('drop', '#drop-zone-spirit', function(e) {
        const files = e.originalEvent.dataTransfer.files;
        if (files.length > 0) {
            droppedGltfFile = null;
            droppedExtraFiles = [];
            processSpiritFiles(files);
        }
    });

    $(document).on('click', '#drop-zone-spirit', function() {
        $('#input-spirit-files').click();
    });

    // Cloudinary Drag & Drop for Slot
    $(document).on('drop', '#drop-zone-slot', async function(e) {
        e.preventDefault(); e.stopPropagation();
        $(this).removeClass('dragover');
        const files = e.originalEvent.dataTransfer.files;
        if (files.length > 0) {
            handleCloudinaryUpload(files[0], '#slot-image-url', '#drop-zone-slot .file-name');
        }
    });
    $(document).on('dragover dragenter', '#drop-zone-slot', function(e) { e.preventDefault(); e.stopPropagation(); $(this).addClass('dragover'); });
    $(document).on('dragleave dragend drop', '#drop-zone-slot', function(e) { e.preventDefault(); e.stopPropagation(); $(this).removeClass('dragover'); });

    $(document).on('click', '#drop-zone-slot', function() {
        $('#input-slot-file').click();
    });

    $(document).on('change', '#input-slot-file', function() {
        if (this.files.length > 0) {
            handleCloudinaryUpload(this.files[0], '#slot-image-url', '#drop-zone-slot .file-name');
        }
    });

    // Album Cover
    $(document).on('drop', '#drop-zone-album-cover', async function(e) {
        e.preventDefault(); e.stopPropagation();
        $(this).removeClass('dragover');
        const files = e.originalEvent.dataTransfer.files;
        if (files.length > 0) {
            handleCloudinaryUpload(files[0], '#input-album-cover', '#drop-zone-album-cover .file-name');
        }
    });
    $(document).on('dragover dragenter', '#drop-zone-album-cover', function(e) { e.preventDefault(); e.stopPropagation(); $(this).addClass('dragover'); });
    $(document).on('dragleave dragend drop', '#drop-zone-album-cover', function(e) { e.preventDefault(); e.stopPropagation(); $(this).removeClass('dragover'); });
    $(document).on('click', '#drop-zone-album-cover', function() { $('#input-album-cover-file').click(); });
    $(document).on('change', '#input-album-cover-file', function() {
        if (this.files.length > 0) handleCloudinaryUpload(this.files[0], '#input-album-cover', '#drop-zone-album-cover .file-name');
    });

    // Album Back
    $(document).on('drop', '#drop-zone-album-back', async function(e) {
        e.preventDefault(); e.stopPropagation();
        $(this).removeClass('dragover');
        const files = e.originalEvent.dataTransfer.files;
        if (files.length > 0) {
            handleCloudinaryUpload(files[0], '#input-album-back', '#drop-zone-album-back .file-name');
        }
    });
    $(document).on('dragover dragenter', '#drop-zone-album-back', function(e) { e.preventDefault(); e.stopPropagation(); $(this).addClass('dragover'); });
    $(document).on('dragleave dragend drop', '#drop-zone-album-back', function(e) { e.preventDefault(); e.stopPropagation(); $(this).removeClass('dragover'); });
    $(document).on('click', '#drop-zone-album-back', function() { $('#input-album-back-file').click(); });
    $(document).on('change', '#input-album-back-file', function() {
        if (this.files.length > 0) handleCloudinaryUpload(this.files[0], '#input-album-back', '#drop-zone-album-back .file-name');
    });

    // Deck Drop Zone
    $(document).on('drop', '#drop-zone-deck', async function(e) {
        e.preventDefault(); e.stopPropagation();
        $(this).removeClass('dragover');
        const files = e.originalEvent.dataTransfer.files;
        if (files.length > 0) {
            handleDeckImageUpload(files[0]);
        }
    });
    $(document).on('dragover dragenter', '#drop-zone-deck', function(e) { e.preventDefault(); e.stopPropagation(); $(this).addClass('dragover'); });
    $(document).on('dragleave dragend drop', '#drop-zone-deck', function(e) { e.preventDefault(); e.stopPropagation(); $(this).removeClass('dragover'); });
    $(document).on('click', '#drop-zone-deck', function() { $('#input-deck-file').click(); });
    $(document).on('change', '#input-deck-file', function() {
        if (this.files.length > 0) handleDeckImageUpload(this.files[0]);
    });

    async function handleDeckImageUpload(file) {
        const $fileName = $('#drop-zone-deck .file-name');
        $fileName.text("Subiendo...").css('color', '#aaa');
        try {
            // Limite de cartas por deck
            const { count } = await _supabase.from('deck_cards').select('*', { count: 'exact', head: true }).eq('deck_id', currentDeckId);
            if (count >= (currentUser.max_cards_per_deck || 60)) {
                Swal.fire('Límite alcanzado', `Este deck ya tiene el máximo de ${currentUser.max_cards_per_deck || 60} cartas permitidas.`, 'warning');
                $fileName.text("");
                return;
            }

            const url = await CloudinaryUpload.uploadImage(file);
            const { error } = await _supabase
                .from('deck_cards')
                .insert([{
                    deck_id: currentDeckId,
                    image_url: url,
                    name: file.name.split('.')[0]
                }]);

            if (error) throw error;

            $fileName.text("¡Añadida!").css('color', '#00ff88');
            setTimeout(() => $fileName.text(""), 2000);
            loadDeckCards(currentDeckId);
        } catch (err) {
            $fileName.text("Error al subir").css('color', '#ff4757');
            Swal.fire('Error', 'No se pudo añadir al deck: ' + err.message, 'error');
        }
    }

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

    $(document).on('change', '#input-spirit-files', function() {
        if (this.files.length > 0) {
            droppedGltfFile = null;
            droppedExtraFiles = [];
            processSpiritFiles(this.files);
        }
    });

    $('#btn-open-upload-spirit').click(function() {
        // Reset form
        $('#spirit-modal-title').text('Subir Nuevo Compañero');
        $('#edit-spirit-id').val('');
        $('#input-spirit-name').val('');
        $('#input-spirit-animation').val('orbit');
        $('#input-spirit-particle-asset').val('cerezo.png');
        $('#input-spirit-particle-movement').val('falling');
        $('#input-spirit-scale').val(1.8);
        droppedGltfFile = null;
        droppedExtraFiles = [];
        updateSpiritDropZoneUI(null);
        $('#spirit-upload-modal').addClass('active');
    });

    $('#close-spirit-upload-modal').click(function() {
        $('#spirit-upload-modal').removeClass('active');
    });

    $('#btn-save-spirit').click(async function() {
        const name = $('#input-spirit-name').val();
        const editId = $('#edit-spirit-id').val();
        const gltfFile = droppedGltfFile;
        const extraFiles = droppedExtraFiles;
        const animation = $('#input-spirit-animation').val();
        const particleAsset = $('#input-spirit-particle-asset').val() || 'cerezo.png';
        const particleMovement = $('#input-spirit-particle-movement').val();
        const scale = parseFloat($('#input-spirit-scale').val()) || 1.8;
        const isPublic = $('#input-spirit-public').is(':checked');

        if (!name) {
            Swal.fire('Atención', 'El nombre es obligatorio', 'warning');
            return;
        }

        if (!editId && !gltfFile) {
            Swal.fire('Atención', 'El archivo GLTF es obligatorio para nuevos compañeros', 'warning');
            return;
        }

        Swal.fire({
            title: editId ? 'Actualizando Compañero...' : 'Subiendo Compañero...',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });

        try {
            let gltfUrl = null;
            let textureUrl = null;

            if (gltfFile) {
                // 1. Upload into a unique folder to preserve relative paths
                const folderId = Date.now() + '_' + Math.floor(Math.random() * 1000);

                // Upload main GLTF
                const gltfPath = `models/${folderId}/${gltfFile.name}`;
                const { data: gltfData, error: gltfErr } = await _supabase.storage
                    .from('spirits')
                    .upload(gltfPath, gltfFile);

                if (gltfErr) throw gltfErr;
                gltfUrl = _supabase.storage.from('spirits').getPublicUrl(gltfPath).data.publicUrl;

                // 2. Upload extra files (textures, bin, etc.) into the SAME folder
                for (const file of extraFiles) {
                    const path = `models/${folderId}/${file.name}`;
                    const { error: extraErr } = await _supabase.storage
                        .from('spirits')
                        .upload(path, file);
                    if (extraErr) console.warn("Error subiendo archivo extra:", file.name, extraErr);

                    // If it's an image, we might use it as the main texture if needed
                    if (file.type.startsWith('image/')) {
                        textureUrl = _supabase.storage.from('spirits').getPublicUrl(path).data.publicUrl;
                    }
                }
            }

            // 3. Save to DB
            const spiritData = {
                name: name,
                animation_type: animation,
                particle_asset: particleAsset,
                particle_movement_type: particleMovement,
                scale: scale,
                is_public: isPublic,
                user_id: currentUser.id
            };

            if (gltfUrl) {
                spiritData.gltf_url = gltfUrl;
                spiritData.texture_url = textureUrl;
            }

            let dbErr;
            if (editId) {
                const { error } = await _supabase
                    .from('spirits')
                    .update(spiritData)
                    .eq('id', editId);
                dbErr = error;
            } else {
                const { error } = await _supabase
                    .from('spirits')
                    .insert([spiritData]);
                dbErr = error;
            }

            if (dbErr) throw dbErr;

            Swal.fire('¡Éxito!', editId ? 'Compañero actualizado correctamente' : 'Compañero subido correctamente', 'success');
            $('#spirit-upload-modal').removeClass('active');
            loadSpirits();
        } catch (err) {
            console.error(err);
            Swal.fire('Error', 'No se pudo guardar el compañero: ' + (err.message || ''), 'error');
        }
    });

    // Toggle Public/Private from list (Albums, Decks, Spirits)
    // --- Chatbot Config Actions ---
    $(document).on('click', '.btn-save-slot', async function() {
        const $card = $(this).closest('.bot-slot-card');
        const type = $card.data('type');
        const content = $card.find('.slot-content').val().trim();
        const isActive = $card.find('.toggle-slot').is(':checked');
        const redirect = $card.find('.slot-redirect').val();
        const duration = parseInt($card.find('.slot-duration').val()) || 5;

        if (!content && isActive) {
            Swal.fire('Atención', 'Si el mensaje está activo, debe tener contenido.', 'warning');
            return;
        }

        Swal.fire({ title: 'Guardando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        try {
            const msgData = {
                user_id: currentUser.id,
                type: type,
                content: content,
                is_active: isActive,
                redirect_url: redirect || null,
                duration: duration,
                view_type: 'public'
            };

            const { error } = await _supabase
                .from('bot_messages')
                .upsert(msgData, { onConflict: 'user_id,type' });

            if (error) throw error;

            Swal.fire({ title: '¡Configuración Guardada!', icon: 'success', timer: 1500, showConfirmButton: false });
        } catch (err) {
            console.error(err);
            Swal.fire('Error', 'No se pudo guardar la configuración: ' + err.message, 'error');
        }
    });

    $(document).on('change', '.toggle-public', async function() {
        const id = $(this).data('id');
        const type = $(this).data('type');
        const isChecked = $(this).is(':checked');
        const $label = $(this).parent().next();
        const $card = $(this).closest('.album-card, .spirit-card');

        // Optimistic UI update
        $label.text(isChecked ? 'Público' : 'Privado');
        if ($card.length) {
            $card.css('transition', 'opacity 0.3s ease');
            $card.css('opacity', isChecked ? '1' : '0.7');
        }

        const { error } = await _supabase
            .from(type)
            .update({ is_public: isChecked })
            .eq('id', id);

        if (error) {
            console.error('Error updating visibility:', error);
            if (error.code === '42703' || (error.message && error.message.includes('is_public'))) {
                Swal.fire('Error de Base de Datos', 'La columna "is_public" no existe en la tabla ' + type + '.', 'error');
            } else {
                Swal.fire({
                    title: 'Error',
                    text: 'No se pudo actualizar la visibilidad',
                    icon: 'error',
                    toast: true,
                    position: 'top-end',
                    timer: 3000,
                    showConfirmButton: false
                });
            }
            // Revert UI if error
            $(this).prop('checked', !isChecked);
            $label.text(!isChecked ? 'Público' : 'Privado');
            if ($card.length) $card.css('opacity', !isChecked ? '1' : '0.7');
        }
    });
});

function updateSpiritDropZoneUI(files) {
    const $zone = $('#drop-zone-spirit');
    const $fileName = $zone.find('.file-name');
    if (files && files.length > 0) {
        let html = "";
        if (droppedGltfFile) {
            html += `<div style="color: #00d2ff; font-weight: bold; margin-bottom: 5px;"><i class="fas fa-file-code"></i> Principal: ${droppedGltfFile.name}</div>`;
        }
        if (droppedExtraFiles.length > 0) {
            html += `<div style="font-size: 11px; color: #aaa;"><i class="fas fa-paperclip"></i> ${droppedExtraFiles.length} archivos adicionales</div>`;
        }
        $fileName.html(html);
        $zone.find('p').hide();
        $zone.find('i.fa-cloud-upload-alt').hide();
    } else {
        $fileName.text('');
        $zone.find('p').show();
        $zone.find('i.fa-cloud-upload-alt').show();
    }
}

function processSpiritFiles(files) {
    const fileArray = Array.from(files);
    let foundGltf = false;

    fileArray.forEach(file => {
        const name = file.name.toLowerCase();
        if (!foundGltf && (name.endsWith('.gltf') || name.endsWith('.glb'))) {
            droppedGltfFile = file;
            foundGltf = true;
        } else {
            droppedExtraFiles.push(file);
        }
    });

    updateSpiritDropZoneUI(fileArray);
}

function editSpirit(spirit) {
    $('#spirit-modal-title').text('Editar Compañero: ' + spirit.name);
    $('#edit-spirit-id').val(spirit.id);
    $('#input-spirit-name').val(spirit.name);
    $('#input-spirit-animation').val(spirit.animation_type || 'orbit');
    $('#input-spirit-particle-asset').val(spirit.particle_asset || 'cerezo.png');
    $('#input-spirit-particle-movement').val(spirit.particle_movement_type || 'falling');
    $('#input-spirit-scale').val(spirit.scale || 1.8);
    $('#input-spirit-public').prop('checked', spirit.is_public !== false);

    // Reset file selection for edit (optional)
    droppedGltfFile = null;
    droppedExtraFiles = [];
    updateSpiritDropZoneUI(null);

    $('#spirit-upload-modal').addClass('active');
}

// Auth Functions
async function checkSession() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) {
        const { data: user } = await _supabase
            .from('usuarios')
            .select('id, username, store_name, store_logo, is_store, role, whatsapp_link, messenger_link, selected_spirit_id, max_albums, max_pages, max_decks, max_cards_per_deck, allowed_spirit_ids, has_tracking, has_clients, has_auctions, has_events, max_events')
            .eq('id', session.user.id)
            .single();

        if (user) {
            currentUser = user;
            localStorage.setItem('tcg_session', JSON.stringify(user));
            showAuthenticatedContent();
        } else {
            showLoginView();
        }
    } else {
        showLoginView();
    }
}

async function handleLogin() {
    const userInput = $('#login-username').val().trim();
    const password = $('#login-password').val().trim();

    if (!userInput || !password) {
        Swal.fire('Atención', 'Por favor, completa todos los campos', 'warning');
        return;
    }

    let emailToUse = userInput;

    if (!userInput.includes('@')) {
        // Attempt to find the real email in the 'usuarios' table for existing accounts
        const { data: userRow } = await _supabase
            .from('usuarios')
            .select('email')
            .eq('username', userInput)
            .maybeSingle();

        if (userRow && userRow.email) {
            emailToUse = userRow.email;
        } else {
            // Fallback to our convention for new accounts
            emailToUse = `${userInput}@tcgdual.com`;
        }
    }

    const { data, error } = await _supabase.auth.signInWithPassword({
        email: emailToUse,
        password: password,
    });

    if (error) {
        Swal.fire('Error', 'Error al iniciar sesión: ' + error.message, 'error');
    } else {
        const { data: profile } = await _supabase
            .from('usuarios')
            .select('id, username, store_name, store_logo, is_store, role, whatsapp_link, messenger_link, selected_spirit_id, max_albums, max_pages, max_decks, max_cards_per_deck, allowed_spirit_ids, has_tracking, has_clients, has_auctions, has_events, max_events')
            .eq('id', data.user.id)
            .single();

        currentUser = profile;
        localStorage.setItem('tcg_session', JSON.stringify(profile));
        showAuthenticatedContent();
    }
}

async function handleLogout() {
    await _supabase.auth.signOut();
    currentUser = null;
    localStorage.removeItem('tcg_session');
    location.reload();
}

function showLoginView() {
    $('body').removeClass('public-body');
    $('#login-modal').addClass('active');
    $('#authenticated-content').hide();
}

function initTheme() {
    const savedTheme = localStorage.getItem('tcg_theme') || 'theme-dark';
    applyTheme(savedTheme);
}

function applyTheme(theme) {
    $('body').removeClass('theme-light theme-medium theme-dark').addClass(theme);
    localStorage.setItem('tcg_theme', theme);

    // Update theme icons
    $('.theme-btn, .theme-btn-small').removeClass('active');
    $(`.theme-btn[data-theme="${theme}"], .theme-btn-small[data-theme="${theme}"]`).addClass('active');
}

async function showAuthenticatedContent() {
    $('body').addClass('public-body');
    initTheme(); // Ensure theme is applied after showing content
    $('#login-modal').removeClass('active');
    $('#authenticated-content').show();
    $('#welcome-message').text(`Panel de ${currentUser.username}`);

    // Update floating panel
    $('#top-panel').show();
    if (currentUser.is_store) {
        $('#dropdown-user-logo').show().attr('src', currentUser.store_logo || 'https://midominio.com/placeholder-logo.png');
        $('#dropdown-user-name').text(currentUser.store_name || currentUser.username);
        $('#dropdown-user-role').hide();
    } else {
        $('#dropdown-user-logo').hide();
        $('#dropdown-user-name').text(currentUser.username);
        $('#dropdown-user-role').hide();
    }

    if (currentUser) {
        if (currentUser.role === 'admin') {
            $('#btn-users-panel').show();
            $('#admin-upload-container').show();
        } else {
            $('#btn-users-panel').hide();
            $('#admin-upload-container').hide();
        }
    }

    // Show/Hide feature tiles based on permissions
    if (currentUser.has_tracking) $('#btn-tracking').show(); else $('#btn-tracking').hide();
    if (currentUser.has_clients) $('#btn-clientes').show(); else $('#btn-clientes').hide();
    if (currentUser.has_auctions) $('#btn-subastas').show(); else $('#btn-subastas').hide();
    if (currentUser.has_events !== false) $('#btn-eventos').show(); else $('#btn-eventos').hide();

    // Upgrade button for starter users
    if (currentUser.role === 'starter' || currentUser.role === 'user') {
        $('#upgrade-button-container').html(`
            <button id="btn-upgrade-plan" class="btn-upgrade">
                <i class="fas fa-rocket"></i> Upgrade a Premium
            </button>
        `);
    } else {
        $('#upgrade-button-container').empty();
    }

    // Generate public store link
    const identifier = currentUser.is_store ? `store=${encodeURIComponent(currentUser.store_name)}` : `user=${encodeURIComponent(currentUser.username)}`;
    const publicUrl = `${window.location.origin}${window.location.pathname.replace('admin.html', 'public.html')}?${identifier}`;

    const linkHtml = `
        <div class="share-card">
            <div class="share-info">
                <i class="fas fa-link"></i>
                <span>Enlace de tu tienda:</span>
                <input type="text" id="public-link-input" value="${publicUrl}" readonly>
            </div>
            <button onclick="copyPublicLink()" class="btn btn-copy">
                <i class="fas fa-copy"></i> Copiar
            </button>
            <a href="${publicUrl}" target="_blank" class="btn btn-visit">
                <i class="fas fa-external-link-alt"></i> Visitar
            </a>
        </div>
    `;
    $('#store-link-container').html(linkHtml);

    showView('main-dashboard');

    // Load store contact data
    $('#store-whatsapp').val(currentUser.whatsapp_link || '');
    $('#store-messenger').val(currentUser.messenger_link || '');

    // Load current spirit for floating companion
    if (currentUser.selected_spirit_id) {
        const { data: spiritData } = await _supabase
            .from('spirits')
            .select('*')
            .eq('id', currentUser.selected_spirit_id)
            .single();
        if (spiritData) {
            window.currentSpirit = spiritData;

            // Fetch additional data for CompanionBot
            const [{ data: botMessages }, { data: sealedProducts }] = await Promise.all([
                _supabase.from('bot_messages').select('*').eq('user_id', currentUser.id).eq('is_active', true).or('view_type.eq.admin,view_type.eq.both'),
                _supabase.from('sealed_products').select('id').eq('user_id', currentUser.id).limit(1)
            ]);

            window.currentStoreDataForBot = {
                user: currentUser,
                customMessages: botMessages,
                hasSealed: sealedProducts && sealedProducts.length > 0
            };

            initFloatingCompanion();
        }
    }
}

function copyPublicLink() {
    const copyText = document.getElementById("public-link-input");
    copyText.select();
    copyText.setSelectionRange(0, 99999); // For mobile devices
    navigator.clipboard.writeText(copyText.value);

    const btn = document.querySelector('.btn-copy');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i> ¡Copiado!';
    btn.classList.add('btn-success');

    setTimeout(() => {
        btn.innerHTML = originalText;
        btn.classList.remove('btn-success');
    }, 2000);
}

// Data Functions
// Deck Functions
async function loadDecks() {
    $('#deck-list').html('<div class="loading">Cargando decks...</div>');

    const { data: decks, error } = await _supabase
        .from('decks')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('id', { ascending: true });

    if (error) {
        $('#deck-list').html('<div class="error">Error al cargar decks.</div>');
        return;
    }

    if (decks.length === 0) {
        $('#deck-list').html('<div class="empty">No tienes decks. Crea uno para empezar.</div>');
        return;
    }

    const $tempContainer = $('<div></div>');
    decks.forEach(deck => {
        const isPublic = deck.is_public !== false;
        const publicSwitch = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <label class="switch">
                    <input type="checkbox" class="toggle-public" data-id="${deck.id}" data-type="decks" ${isPublic ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
                <span style="font-size: 10px; color: #aaa;">${isPublic ? 'Público' : 'Privado'}</span>
            </div>
        `;

        const $card = $(`
            <div class="album-card">
                <div class="deck-preview-icon"><i class="fas fa-layer-group fa-3x"></i></div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
                    <h3 style="margin:0;">${deck.name}</h3>
                </div>
                <div style="margin-top: 5px;">
                    ${publicSwitch}
                </div>
                <div style="display:flex; gap:10px; margin-top:auto;">
                    <button class="btn btn-edit-deck" data-id="${deck.id}">Editar</button>
                    <button class="btn btn-danger btn-delete-deck" data-id="${deck.id}">Eliminar</button>
                </div>
            </div>
        `);

        $card.find('.btn-edit-deck').click((e) => { e.preventDefault(); editDeck(deck); });
        $card.find('.btn-delete-deck').click((e) => { e.preventDefault(); deleteDeck(deck.id); });

        $tempContainer.append($card);
    });
    $('#deck-list').html($tempContainer.contents());
}

async function editDeck(deck) {
    // Re-fetch para evitar datos obsoletos del cierre
    const { data: latestDeck } = await _supabase
        .from('decks')
        .select('*')
        .eq('id', deck.id)
        .single();

    const target = latestDeck || deck;

    currentDeckId = target.id;
    $('#deck-editor-title').text(`Editando: ${target.name}`);
    $('#input-deck-name').val(target.name);
    $('#input-deck-public').prop('checked', target.is_public !== false);

    // Load pricing fields
    $('#input-deck-use-special').prop('checked', target.use_special_price === true);
    $('#input-deck-special-price').val(target.special_price || '');
    if (target.use_special_price) {
        $('#special-price-container').show();
    } else {
        $('#special-price-container').hide();
    }

    showView('deck-editor');
    loadDeckCards(target.id);
}

async function deleteDeck(id) {
    const result = await Swal.fire({
        title: '¿Eliminar deck?',
        text: "Se eliminará el deck y todas sus cartas",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ff4757',
        confirmButtonText: 'Sí, eliminar'
    });

    if (result.isConfirmed) {
        const { error } = await _supabase.from('decks').delete().eq('id', id);
        if (error) {
            Swal.fire('Error', 'No se pudo eliminar el deck', 'error');
        } else {
            loadDecks();
        }
    }
}

async function loadDeckCards(deckId) {
    $('#deck-card-list').html('<div class="loading">Cargando imágenes...</div>');

    const { data: cards, error } = await _supabase
        .from('deck_cards')
        .select('*')
        .eq('deck_id', deckId)
        .order(deckSortOrder, { ascending: true });

    if (error) {
        $('#deck-card-list').html('<div class="error">Error al cargar imágenes.</div>');
        return;
    }

    // Calculate total sum
    const totalSum = (cards || []).reduce((sum, card) => {
        const price = parseFloat((card.price || '0').replace(/[^0-9.]/g, '')) || 0;
        const qty = parseInt(card.quantity) || 1;
        return sum + (price * qty);
    }, 0);
    $('#deck-total-sum').text('$' + totalSum.toFixed(2));

    const $tempContainer = $('<div></div>');
    cards.forEach(card => {
        const $cardItem = $(`
            <div class="album-card deck-card-item" data-id="${card.id}" style="cursor:pointer; position:relative;">
                <div class="btn-delete-card-top btn-delete-deck-card"><i class="fas fa-times"></i></div>
                <img src="${card.image_url}" style="width:100%; height:150px; object-fit:contain;">
                <div style="font-size: 12px; margin-top: 5px; color: #aaa; text-align: center;">${card.name || 'Sin nombre'}</div>
            </div>
        `);

        $cardItem.click((e) => {
            e.preventDefault();
            if ($(e.target).closest('.btn-delete-deck-card').length) return;
            editDeckCard(card);
        });

        $cardItem.find('.btn-delete-deck-card').click(async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const res = await Swal.fire({
                title: '¿Eliminar carta?',
                text: "¿Estás seguro de que quieres eliminar esta carta del deck?",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ff4757',
                cancelButtonColor: '#333',
                confirmButtonText: 'Sí, eliminar',
                cancelButtonText: 'Cancelar'
            });
            if (res.isConfirmed) {
                await _supabase.from('deck_cards').delete().eq('id', card.id);
                loadDeckCards(deckId);
            }
        });

        $tempContainer.append($cardItem);
    });
    $('#deck-card-list').html($tempContainer.contents());
    initDeckSorting();
}

function initDeckSorting() {
    const el = document.getElementById('deck-card-list');
    if (!el || !window.Sortable) return;

    // Destroy existing instance if any
    if (el._sortable) el._sortable.destroy();

    el._sortable = Sortable.create(el, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        onEnd: async function() {
            const cardIds = [];
            $('#deck-card-list .deck-card-item').each(function() {
                cardIds.push($(this).data('id'));
            });
            await updateCardOrder(cardIds);
        }
    });
}

async function updateCardOrder(cardIds) {
    try {
        const promises = cardIds.map((id, index) =>
            _supabase.from('deck_cards').update({ position: index }).eq('id', id)
        );
        await Promise.all(promises);
        console.log("Orden de cartas actualizado");
    } catch (err) {
        console.error("Error al actualizar orden:", err);
    }
}

function editDeckCard(card) {
    editingType = 'deck-card';
    currentDeckCardId = card.id;

    $('#slot-image-url').val(card.image_url || '');
    $('#slot-name').val(card.name || '');

    let holo = card.holo_effect || '';
    if (holo.startsWith('custom-foil|')) {
        const parts = holo.split('|');
        $('#slot-holo-effect').val('custom-foil');
        $('#slot-custom-foil-type').val(parts[1] || 'foil');
        $('#custom-foil-type-container').show();
        $('#custom-mask-container').show();
    } else {
        $('#slot-holo-effect').val(holo);
        $('#custom-foil-type-container').hide();
        if (holo === 'custom-texture') {
            $('#custom-mask-container').show();
        } else {
            $('#custom-mask-container').hide();
        }
    }

    $('#slot-custom-mask').val(card.custom_mask_url || '');

    $('#slot-rarity').val(card.rarity || '');
    $('#slot-expansion').val(card.expansion || '');
    $('#slot-condition').val(card.condition || '');
    $('#slot-quantity').val(card.quantity || 1);
    $('#slot-price').val(card.price || '');

    $('#slot-modal').addClass('active');
}

async function loadAlbums() {
    $('#album-list').html('<div class="loading">Cargando álbumes...</div>');

    const { data: albums, error } = await _supabase
        .from('albums')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('id', { ascending: true });

    if (error) {
        $('#album-list').html('<div class="error">Error al cargar álbumes.</div>');
        return;
    }

    if (albums.length === 0) {
        $('#album-list').html('<div class="empty">No tienes álbumes. Crea uno para empezar.</div>');
        return;
    }

    const $tempContainer = $('<div></div>');
    albums.forEach(album => {
        const cover = album.cover_image_url || 'https://via.placeholder.com/300x150?text=Sin+Portada';
        const isPublic = album.is_public !== false;
        const publicSwitch = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <label class="switch">
                    <input type="checkbox" class="toggle-public" data-id="${album.id}" data-type="albums" ${isPublic ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
                <span style="font-size: 10px; color: #aaa;">${isPublic ? 'Público' : 'Privado'}</span>
            </div>
        `;

        const $card = $(`
            <div class="album-card">
                <img src="${cover}" alt="${album.title}">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
                    <h3 style="margin:0;">${album.title}</h3>
                </div>
                <div style="margin-top: 5px;">
                    ${publicSwitch}
                </div>
                <div style="display:flex; gap:10px; margin-top:auto;">
                    <button class="btn btn-edit-album" data-id="${album.id}">Editar</button>
                    <button class="btn btn-danger btn-delete-album" data-id="${album.id}">Eliminar</button>
                </div>
            </div>
        `);

        $card.find('.btn-edit-album').click((e) => { e.preventDefault(); editAlbum(album); });
        $card.find('.btn-delete-album').click((e) => { e.preventDefault(); deleteAlbum(album.id); });

        $tempContainer.append($card);
    });
    $('#album-list').html($tempContainer.contents());
}

function showView(view) {
    $('.admin-section').hide().removeClass('active');
    $(`#view-${view}`).show().addClass('active');
}

async function editAlbum(album) {
    // Re-fetch para evitar datos obsoletos del cierre
    const { data: latestAlbum } = await _supabase
        .from('albums')
        .select('*')
        .eq('id', album.id)
        .single();

    const target = latestAlbum || album;

    currentAlbumId = target.id;
    $('#editor-title').text(`Editando: ${target.title}`);
    $('#input-album-title').val(target.title);
    $('#input-album-cover').val(target.cover_image_url || '');
    $('#input-album-back').val(target.back_image_url || '');
    $('#drop-zone-album-cover .file-name').text('');
    $('#drop-zone-album-back .file-name').text('');
    $('#input-album-cover-color').val(target.cover_color || '#1a1a1a');
    $('#input-album-back-color').val(target.back_color || '#1a1a1a');
    $('#input-album-public').prop('checked', target.is_public !== false);
    
    showView('editor');
    loadAlbumPages(target.id);
}

async function deleteAlbum(id) {
    const result = await Swal.fire({
        title: '¿Estás seguro?',
        text: "Se eliminará el álbum y todo su contenido permanentemente",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ff4757',
        cancelButtonColor: '#333',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
        const { error } = await _supabase.from('albums').delete().eq('id', id);
        if (error) {
            Swal.fire('Error', 'No se pudo eliminar el álbum', 'error');
        } else {
            Swal.fire('Eliminado', 'El álbum ha sido borrado', 'success');
            loadAlbums();
        }
    }
}

async function loadAlbumPages(albumId, isInitial = true) {
    if (isInitial) {
        $('#page-list').html('<div class="loading">Cargando páginas...</div>');
    }

    const { data: pages, error } = await _supabase
        .from('pages')
        .select('*')
        .eq('album_id', albumId)
        .order('page_index', { ascending: true });

    if (error) {
        $('#page-list').html('<div class="error">Error al cargar páginas.</div>');
        return;
    }

    // Toggle bottom add button visibility
    if (pages && pages.length > 0) {
        $('#btn-add-page-bottom-container').show();
    } else {
        $('#btn-add-page-bottom-container').hide();
    }

    // Obtener todos los slots de todas las páginas en una sola consulta
    const pageIds = pages.map(p => p.id);
    let allSlots = [];
    if (pageIds.length > 0) {
        const { data: slotsData } = await _supabase
            .from('card_slots')
            .select('*')
            .in('page_id', pageIds);
        allSlots = slotsData || [];
    }

    const $tempContainer = $('<div></div>');
    
    for (const page of pages) {
        const $pageItem = $(`
            <div class="admin-page-item" data-id="${page.id}">
                <h3>
                    Página ${page.page_index + 1}
                    <button class="btn btn-danger btn-sm btn-delete-page" data-id="${page.id}">Eliminar Página</button>
                </h3>
                <div class="grid-container admin-grid-preview">
                    <!-- 9 Slots -->
                </div>
            </div>
        `);

        $pageItem.find('.btn-delete-page').click((e) => {
            e.preventDefault();
            deletePage(page.id);
        });

        const $grid = $pageItem.find('.grid-container');
        const pageSlots = allSlots.filter(s => s.page_id === page.id);

        for (let i = 0; i < 9; i++) {
            const slotData = pageSlots.find(s => s.slot_index === i);
            const $slot = $(`<div class="card-slot" data-index="${i}"></div>`);
            if (slotData && slotData.image_url) {
                $slot.append(`<img src="${slotData.image_url}" class="tcg-card">`);

                // Add Delete Button (Jules)
                const $btnDelete = $('<div class="btn-delete-card-top"><i class="fas fa-times"></i></div>');
                $btnDelete.click(async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const res = await Swal.fire({
                        title: '¿Eliminar carta?',
                        text: "¿Estás seguro de que quieres quitar esta carta del álbum?",
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonColor: '#ff4757',
                        cancelButtonColor: '#333',
                        confirmButtonText: 'Sí, eliminar',
                        cancelButtonText: 'Cancelar'
                    });
                    if (res.isConfirmed) {
                        const { error } = await _supabase
                            .from('card_slots')
                            .delete()
                            .eq('page_id', page.id)
                            .eq('slot_index', i);

                        if (error) {
                            Swal.fire('Error', 'No se pudo eliminar la carta', 'error');
                        } else {
                            loadAlbumPages(albumId, false);
                        }
                    }
                });
                $slot.append($btnDelete);
            } else {
                $slot.append('<div style="color:#444; font-size:10px; text-align:center; padding-top:10px;">Vacío</div>');
            }
            $grid.append($slot);
        }

        $tempContainer.append($pageItem);
    }

    $('#page-list').html($tempContainer.contents());
}

async function deletePage(id) {
    const result = await Swal.fire({
        title: '¿Eliminar página?',
        text: "Esta acción no se puede deshacer",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ff4757',
        cancelButtonColor: '#333',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
        const { error } = await _supabase.from('pages').delete().eq('id', id);
        if (error) {
            Swal.fire('Error', 'No se pudo eliminar la página', 'error');
        } else {
            Swal.fire('Eliminada', 'La página ha sido borrada', 'success');
            loadAlbumPages(currentAlbumId, false);
        }
    }
}

async function loadSpirits() {
    $('#spirits-grid').html('<div class="loading">Cargando compañeros...</div>');

    // Fetch spirits and user's selection
    const [spiritsRes, userRes] = await Promise.all([
        _supabase.from('spirits').select('*').order('name', { ascending: true }),
        _supabase.from('usuarios').select('selected_spirit_id').eq('id', currentUser.id).single()
    ]);

    if (spiritsRes.error || !spiritsRes.data) {
        $('#spirits-grid').html('<div class="error">Error al cargar compañeros.</div>');
        return;
    }

    const spirits = spiritsRes.data;
    const selectedId = userRes.data ? userRes.data.selected_spirit_id : null;

    if (spirits.length === 0) {
        $('#spirits-grid').html('<div class="empty">No hay compañeros disponibles.</div>');
        return;
    }

    const $grid = $('#spirits-grid');
    $grid.empty();

    spirits.forEach(spirit => {
        const isSelected = spirit.id == selectedId;
        const isAsh = spirit.gltf_url && spirit.gltf_url.toLowerCase().includes('ash.gltf');
        const isPublic = spirit.is_public !== false;

        // Filtrado por plan/permisos
        let isAllowed = false;

        // 1. Roles con acceso total por defecto
        if (currentUser.role === 'premium' || currentUser.role === 'admin' || currentUser.role === 'admin_store') {
            isAllowed = true;
        } else if (spirit.name.toLowerCase().includes('winged kuriboh')) {
            // Starter con acceso a Winged Kuriboh por defecto
            isAllowed = true;
        }

        // 2. Overrides del admin (Prevalece sobre los roles si está configurado específicamente)
        // Tratamos '1' como el default para starter, pero si es 'all' o una lista específica (no '1'), aplicamos lógica de override.
        if (currentUser.allowed_spirit_ids === 'all') {
            isAllowed = true;
        } else if (currentUser.allowed_spirit_ids && currentUser.allowed_spirit_ids !== '1' && currentUser.allowed_spirit_ids !== '') {
            const allowedIds = currentUser.allowed_spirit_ids.split(',').map(s => s.trim());
            // Para starters, esto EXPANDE su acceso.
            // Para premium/admin, si el admin puso una lista específica, esto podría RESTRINGIR si así lo desea el sistema,
            // pero para esta implementación lo usaremos principalmente para EXPANDIR a los starter.
            if (allowedIds.includes(spirit.id.toString())) {
                isAllowed = true;
            }
        }

        if (!isAllowed) return;

        const $card = $(`
            <div class="spirit-card ${isSelected ? 'selected' : ''}">
                <div class="badge-selected">Seleccionado</div>
                <model-viewer
                    src="${spirit.gltf_url}"
                    loading="lazy"
                    camera-controls
                    shadow-intensity="1"
                    environment-image="neutral"
                    exposure="1.2">
                </model-viewer>
                <h3>${spirit.name}</h3>
                <div style="margin-bottom: 15px; width: 100%;">
                    <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <label class="switch">
                            <input type="checkbox" class="toggle-public" data-id="${spirit.id}" data-type="spirits" ${isPublic ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                        <span style="font-size: 10px; color: #aaa;">${isPublic ? 'Público' : 'Privado'}</span>
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">
                    <button class="btn btn-select ${isSelected ? 'btn-success' : ''}" ${isSelected ? 'disabled' : ''}>
                        ${isSelected ? '<i class="fas fa-check-circle"></i> Seleccionado' : 'Seleccionar'}
                    </button>
                    ${currentUser.role === 'admin' ? `
                        <div style="display: flex; gap: 10px;">
                            <button class="btn btn-secondary btn-edit-spirit" style="flex: 1;"><i class="fas fa-edit"></i> Editar</button>
                            <button class="btn btn-danger btn-delete-spirit" data-id="${spirit.id}" style="flex: 1;"><i class="fas fa-trash"></i></button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `);

        $card.find('.btn-delete-spirit').click(function() {
            const id = $(this).data('id');
            deleteSpirit(id, spirit.gltf_url);
        });

        $card.find('.btn-edit-spirit').click(function() {
            window.editSpirit(spirit);
        });

        $card.find('.btn-select').click(async function() {
            const { error } = await _supabase
                .from('usuarios')
                .update({ selected_spirit_id: spirit.id })
                .eq('id', currentUser.id);

            if (error) {
                Swal.fire('Error', 'No se pudo seleccionar el compañero', 'error');
            } else {
                window.currentSpirit = spirit;
                initFloatingCompanion();
                Swal.fire({
                    title: '¡Compañero Seleccionado!',
                    text: `${spirit.name} aparecerá en tus pantallas de carga.`,
                    icon: 'success',
                    timer: 2000,
                    showConfirmButton: false
                });
                loadSpirits();
            }
        });

        $grid.append($card);
    });
}

function initFloatingCompanion() {
    if (!window.currentSpirit) return;

    const $container = $('#floating-companion-container');
    setTimeout(makeCompanionDraggable, 1000);
    $container.html(`
        <model-viewer
            src="${window.currentSpirit.gltf_url}"
            auto-rotate
            camera-controls
            rotation="0deg 0deg 0deg"
            shadow-intensity="1"
            environment-image="neutral"
            exposure="1"
            interaction-prompt="none">
        </model-viewer>
    `);

    $container.off('click').on('click', function(e) {
        if (window.isCompanionDragging) return;
        e.stopPropagation();
        $('#companion-menu').toggleClass('active');
    });

    // Initialize CompanionBot Tips
    if (typeof CompanionBot === 'function') {
        const bot = new CompanionBot({
            supabase: _supabase,
            userId: currentUser.id,
            userType: 'admin',
            customMessages: window.currentStoreDataForBot ? window.currentStoreDataForBot.customMessages : [],
            onAction: (msg) => {
                if (msg.type === 'album_link') {
                    showView('dashboard');
                    loadAlbums();
                } else if (msg.redirect_url && msg.redirect_url.startsWith('http')) {
                    window.open(msg.redirect_url, '_blank');
                }
            }
        });
        bot.init();
        window.botInstance = bot;
    }
}

async function deleteSpirit(id, gltfUrl) {
    const result = await Swal.fire({
        title: '¿Eliminar Compañero?',
        text: "Se eliminará el registro y todos los archivos asociados en el servidor.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ff4757',
        confirmButtonText: 'Sí, eliminar'
    });

    if (result.isConfirmed) {
        Swal.fire({
            title: 'Eliminando...',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });

        try {
            // 1. Delete from Storage (Cleanup)
            // Extract folder path: models/{folderId}/filename.gltf
            if (gltfUrl && gltfUrl.includes('/models/')) {
                const parts = gltfUrl.split('/models/');
                if (parts.length > 1) {
                    const folderPath = parts[1].split('/')[0];
                    const fullFolderPath = `models/${folderPath}`;

                    // List files in folder to delete them
                    const { data: files, error: listErr } = await _supabase.storage
                        .from('spirits')
                        .list(fullFolderPath);

                    if (!listErr && files) {
                        const filesToRemove = files.map(f => `${fullFolderPath}/${f.name}`);
                        const { error: delErr } = await _supabase.storage
                            .from('spirits')
                            .remove(filesToRemove);
                        if (delErr) console.warn("Error eliminando archivos de storage:", delErr);
                    }
                }
            }

            // 2. Delete from DB
            const { error: dbErr } = await _supabase
                .from('spirits')
                .delete()
                .eq('id', id);

            if (dbErr) throw dbErr;

            Swal.fire('¡Eliminado!', 'El compañero ha sido borrado correctamente.', 'success');
            loadSpirits();
        } catch (err) {
            console.error(err);
            Swal.fire('Error', 'No se pudo eliminar el compañero: ' + (err.message || ''), 'error');
        }
    }
}

async function loadBotMessages() {
    // 1. Populate albums to dropdowns
    const { data: albums } = await _supabase
        .from('albums')
        .select('title')
        .eq('user_id', currentUser.id);

    $('.album-select').empty().append('<option value="">Selecciona un álbum...</option>');
    if (albums) {
        albums.forEach(a => {
            $('.album-select').append(`<option value="${a.title}">${a.title}</option>`);
        });
    }

    // 2. Load saved messages
    const { data: messages } = await _supabase
        .from('bot_messages')
        .select('*')
        .eq('user_id', currentUser.id);

    if (messages) {
        messages.forEach(msg => {
            const $card = $(`.bot-slot-card[data-type="${msg.type}"]`);
            if ($card.length) {
                $card.find('.slot-content').val(msg.content);
                $card.find('.toggle-slot').prop('checked', msg.is_active);
                $card.find('.slot-duration').val(msg.duration || 5);
                if (msg.type === 'album_link') {
                    $card.find('.album-select').val(msg.redirect_url);
                } else {
                    $card.find('.slot-redirect').val(msg.redirect_url);
                }
            }
        });
    }
}

async function loadSlotData(pageId, slotIndex) {
    editingType = 'slot';
    const { data, error } = await _supabase
        .from('card_slots')
        .select('*')
        .eq('page_id', pageId)
        .eq('slot_index', slotIndex)
        .single();

    $('#slot-image-url').val('');
    $('#drop-zone-slot .file-name').text('');
    $('#slot-name').val('');
    $('#external-search-input').val('');
    $('#external-search-results').empty();
    $('#slot-holo-effect').val('');
    $('#slot-custom-foil-type').val('foil');
    $('#custom-foil-type-container').hide();
    $('#slot-custom-mask').val('');
    $('#custom-mask-container').hide();
    $('#slot-rarity').val('');
    $('#slot-expansion').val('');
    $('#slot-condition').val('');
    $('#slot-quantity').val('');
    $('#slot-price').val('');

    if (data) {
        $('#slot-image-url').val(data.image_url || '');
        $('#slot-name').val(data.name || '');

        let holo = data.holo_effect || '';
        if (holo.startsWith('custom-foil|')) {
            const parts = holo.split('|');
            $('#slot-holo-effect').val('custom-foil');
            $('#slot-custom-foil-type').val(parts[1] || 'foil');
            $('#custom-foil-type-container').show();
            $('#custom-mask-container').show();
        } else {
            $('#slot-holo-effect').val(holo);
            $('#custom-foil-type-container').hide();
            if (holo === 'custom-texture') {
                $('#custom-mask-container').show();
            } else {
                $('#custom-mask-container').hide();
            }
        }

        $('#slot-custom-mask').val(data.custom_mask_url || '');

        $('#slot-rarity').val(data.rarity || '');
        $('#slot-expansion').val(data.expansion || '');
        $('#slot-condition').val(data.condition || '');
        $('#slot-quantity').val(data.quantity || '');
        $('#slot-price').val(data.price || '');

    }

    $('#slot-modal').addClass('active');
}

function makeCompanionDraggable() {
    const wrapper = document.getElementById('companion-wrapper');
    const handle = document.getElementById('companion-drag-handle');
    if (!wrapper || !handle) return;

    let isDragging = false;
    let startX, startY;
    let initialX, initialY;
    window.isCompanionDragging = false;

    // Reset touchAction on the companion container to allow internal interactions
    const companion = document.getElementById('floating-companion-container');
    if (companion) companion.style.touchAction = 'auto';

    handle.style.touchAction = 'none';

    handle.addEventListener('pointerdown', (e) => {
        isDragging = true;
        window.isCompanionDragging = false;
        startX = e.clientX;
        startY = e.clientY;
        const rect = wrapper.getBoundingClientRect();
        initialX = rect.left;
        initialY = rect.top;
        handle.setPointerCapture(e.pointerId);
        e.stopPropagation();
    });

    window.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) window.isCompanionDragging = true;
        let newX = initialX + dx;
        let newY = initialY + dy;
        newX = Math.max(0, Math.min(window.innerWidth - wrapper.offsetWidth, newX));
        newY = Math.max(0, Math.min(window.innerHeight - wrapper.offsetHeight, newY));

        wrapper.style.left = newX + 'px';
        wrapper.style.top = newY + 'px';
        wrapper.style.bottom = 'auto';
        wrapper.style.right = 'auto';
        wrapper.style.margin = '0';
    });

    window.addEventListener('pointerup', (e) => {
        if (!isDragging) return;
        isDragging = false;
        setTimeout(() => { window.isCompanionDragging = false; }, 100);
    });
}
