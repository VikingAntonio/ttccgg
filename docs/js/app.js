let isDragging = false;
let isMoving = false;
let isManualPageTurn = false;
let startX, startY;

const POKEMON_FOILS = {
    'pk-rare-holo': 'rare holo',
    'pk-rare-holo-cosmos': 'rare holo cosmos',
    'pk-rare-holo-v': 'rare holo v',
    'pk-rare-holo-vmax': 'rare holo vmax',
    'pk-rare-holo-vstar': 'rare holo vstar',
    'pk-rare-rainbow': 'rare rainbow',
    'pk-rare-rainbow-alt': 'rare rainbow alt',
    'pk-rare-secret': 'rare secret',
    'pk-rare-shiny': 'rare shiny',
    'pk-rare-shiny-v': 'rare shiny v',
    'pk-rare-shiny-vmax': 'rare shiny vmax',
    'pk-amazing-rare': 'amazing rare',
    'pk-radiant-rare': 'radiant rare',
    'pk-rare-ultra': 'rare ultra pokemon',
    'pk-trainer-gallery': 'trainer gallery rare holo',
    'pk-trainer-gallery-secret-rare': 'trainer gallery rare secret',
    'pk-trainer-gallery-v-max': 'trainer gallery rare holo vmax',
    'pk-trainer-gallery-v-regular': 'trainer gallery rare holo v',
    'pk-trainer-full-art': 'rare ultra supporter',
    'pk-rare-holo-v-full-art': 'rare holo v full art',
    'pk-reverse-holo': 'reverse holo'
};

// --- Loading Screen Functions ---
window.isLoading = false;
window.loadingMessage = '';

window.showLoading = function(message) {
    window.isLoading = true;
    window.loadingMessage = message;
    window.dispatchEvent(new CustomEvent('show-loading', {
        detail: { message: message }
    }));
}

window.hideLoading = function() {
    window.isLoading = false;
    window.dispatchEvent(new CustomEvent('hide-loading'));
}

// Aliases for internal use
const showLoading = window.showLoading;
const hideLoading = window.hideLoading;

$(document).ready(async function() {
    await checkSession();
    initTheme();

    // Theme Switcher
    $(document).on('click', '.theme-btn, .theme-btn-small', function() {
        const theme = $(this).data('theme');
        applyTheme(theme);
    });

    // --- Floating Panel Logic ---
    $(document).on('click', '#avatar-btn', function(e) {
        e.stopPropagation();
        $('#user-dropdown').toggleClass('active');
    });

    $(document).on('click', function(e) {
        if (!$(e.target).closest('.user-menu-container').length) {
            if ($('#user-dropdown').hasClass('active')) {
                $('#user-dropdown').removeClass('active');
            }
        }
    });

    $('#menu-spirit-btn, #menu-wishlist-btn').click(function(e) {
        e.preventDefault();
        if ($(this).attr('id') === 'menu-spirit-btn') {
            $('#spirit-modal').addClass('active');
            loadPublicSpirits();
        } else {
            switchView('wishlist');
        }
        $('#user-dropdown').removeClass('active');
    });

    // Zoom Toggle (Public)
    $('#btn-toggle-zoom-public').on('click', function() {
        const viewer = document.getElementById('public-spirit-viewer');
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

    // --- Mobile Interaction Priority (Priority over turn.js) ---
    // Interceptamos eventos en la fase de captura para evitar que turn.js
    // detecte el toque si el usuario está interactuando con un botón.
    const protectedElements = '.zoom-btn, #close-btn, .nav-btn, #clear-search';

    const stopInterference = (e) => {
        if (e.target.closest(protectedElements)) {
            // Detenemos la propagación en fase de captura.
            // Esto evita que el evento llegue a los listeners de turn.js
            e.stopPropagation();
        }
    };

    // Bloqueamos touchstart y mousedown en fase de captura
    document.addEventListener('touchstart', stopInterference, true);
    document.addEventListener('mousedown', stopInterference, true);
    document.addEventListener('pointerdown', stopInterference, true);

    if ($.isTouch === undefined) {
        $.isTouch = 'ontouchstart' in window;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const initialView = urlParams.get('view') || 'albums';

    if (initialView === 'albums') {
        showLoading('Cargando interfaz...');
    }

    loadStoreData();

    $('.nav-btn').click(function() {
        const view = $(this).data('view');
        if (view) switchView(view);
    });

    if (initialView === 'decks') {
        switchView('decks');
    } else if (initialView === 'wishlist') {
        switchView('wishlist');
    } else if (initialView === 'sealed') {
        switchView('sealed');
    } else if (initialView === 'preorders') {
        switchView('preorders');
    } else if (initialView === 'events') {
        switchView('events');
    }

    $('#spirit-btn').click(function() {
        $('#spirit-modal').addClass('active');
        loadPublicSpirits();
    });

    $('#wishlist-nav-btn').click(function() {
        switchView('wishlist');
    });

    $('#preorders-nav-btn').click(function() {
        switchView('preorders');
    });

    $('#close-spirit-modal').click(function() {
        $('#spirit-modal').removeClass('active');
        if (window.spiritViewer) window.spiritViewer.cleanupAllViewers();
    });

    // --- Expanded GLTF Viewer Logic ---
    $(document).on('click', '.spirit-card', function() {
        const gltf = $(this).data('gltf');
        const name = $(this).data('name');
        const spiritId = $(this).data('id');

        if (gltf) {
            $('#expanded-gltf-viewer').attr('src', gltf);
            $('#expanded-gltf-name').text(name);
            $('#gltf-overlay').addClass('active');
            $('body').addClass('modal-open');
        }
    });

    $('#close-gltf-overlay').click(function() {
        $('#gltf-overlay').removeClass('active');
        // Clear src to stop rendering/loading
        $('#expanded-gltf-viewer').attr('src', '');
        if (!$('#image-overlay').hasClass('active') && !$('#spirit-modal').hasClass('active')) {
            $('body').removeClass('modal-open');
        }
    });

    // Spirit Navigation
    $('#btn-prev-spirit-public').click(function() {
        if (!window.allSpirits || window.allSpirits.length <= 1) return;
        window.currentSpiritIndex = (window.currentSpiritIndex - 1 + window.allSpirits.length) % window.allSpirits.length;
        updatePublicSpiritViewer(window.allSpirits[window.currentSpiritIndex], window.currentSpirit ? window.currentSpirit.id : null);
    });

    $('#btn-next-spirit-public').click(function() {
        if (!window.allSpirits || window.allSpirits.length <= 1) return;
        window.currentSpiritIndex = (window.currentSpiritIndex + 1) % window.allSpirits.length;
        updatePublicSpiritViewer(window.allSpirits[window.currentSpiritIndex], window.currentSpirit ? window.currentSpirit.id : null);
    });

    // --- Card Interaction Logic (Click Protection) ---
    $(document).on("touchstart mousedown", ".card-slot", function(e) {
        isDragging = false;
        const ev = e.type.startsWith('touch') ? e.originalEvent.touches[0] : e;
        startX = ev.pageX;
        startY = ev.pageY;
    });

    $(document).on("touchmove mousemove", ".card-slot", function(e) {
        if (startX === undefined || startY === undefined) return;
        const ev = e.type.startsWith('touch') ? e.originalEvent.touches[0] : e;
        if (Math.abs(ev.pageX - startX) > 5 || Math.abs(ev.pageY - startY) > 5) {
            isDragging = true;
        }
    });

    $(document).on("touchend mouseup", function() {
        startX = undefined;
        startY = undefined;
        setTimeout(() => { isDragging = false; }, 100);
    });

    // Delegated click handler as a fallback for desktop or cards without direct listeners
    $(document).on("click", ".card-slot", function(e) {
        if (isDragging) return;
        const $slot = $(this);

        // On mobile, the zoom button handles the click directly to avoid turn.js interference.
        // If we are here on mobile and it's not the zoom button, we ignore it.
        const isMobile = window.innerWidth <= 640;
        if (isMobile) {
            if (!$(e.target).closest('.zoom-btn').length) {
                return;
            }
        }

        if ($slot.closest('.album').length > 0) {
            e.stopPropagation();
        }
        openCardModal($slot);
    });

    $(document).on("click", "#close-btn, #image-overlay", function(e) {
        if (e.target === this || $(this).attr('id') === 'close-btn') {
            $("#image-overlay").removeClass("active");
            $("body").removeClass("modal-open");

            // Clean up 3D effects
            window.card3dActive = false;
            if (card3dOrientationHandler) {
                window.removeEventListener('deviceorientation', card3dOrientationHandler);
                card3dOrientationHandler = null;
            }
        }
    });

    // Search Logic with Debounce
    let searchTimeout;
    $('#search-input').on('input', function() {
        const query = $(this).val().toLowerCase().trim();
        clearTimeout(searchTimeout);

        if (query.length > 0) {
            $('#clear-search').show();
            searchTimeout = setTimeout(() => {
                filterContent(query);
            }, 300); // 300ms debounce
        } else {
            $('#clear-search').hide();
            resetFilter();
        }
    });

    $('#clear-search').click(function() {
        $('#search-input').val('');
        $(this).hide();
        resetFilter();
    });

    // --- Chatbot Logic ---
    const faqResponses = {
        'album': 'Para crear un álbum, ve al Panel de Control, inicia sesión y haz clic en "Crear Nuevo Álbum". Luego puedes añadir páginas y cartas.',
        'scanner': 'El scanner te permite añadir cartas rápidamente usando la cámara de tu móvil. Escanea el código de la carta y se añadirá automáticamente a tu álbum o deck.',
        'theme': 'Puedes cambiar el tema (Claro, Medio, Oscuro) usando los iconos en la esquina superior izquierda de la pantalla.',
        'spirit': 'Elige a tu Compañero ideal, quien te guiará y acompañará a través de toda la web en tu aventura coleccionista.'
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

    $(document).on('click', '#events-container .deck-public-item', function(e) {
        if ($(e.target).closest('button').length) return;
        const id = $(this).attr('id');
        if (id && id.startsWith('event-')) {
            const eventId = id.replace('event-', '');
            showGeneralEventDetails(eventId);
        }
    });

    $('#close-ed-overlay').click(() => $('#event-details-overlay').removeClass('active'));

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
            $('#expanded-gltf-viewer').attr('src', window.currentSpirit.gltf_url);
            $('#expanded-gltf-name').text(window.currentSpirit.name);
            $('#gltf-overlay').addClass('active');
            $('body').addClass('modal-open');
        }
        $('#companion-menu').removeClass('active');
    });

    // --- Cart Integration ---
    $(document).on('click', '#btn-add-to-cart', function(e) {
        e.preventDefault();
        if (window.currentCardData) {
            Cart.add(window.currentCardData);
            Swal.fire({
                title: '¡Añadido!',
                text: `${window.currentCardData.name} se ha agregado al carrito.`,
                icon: 'success',
                timer: 1500,
                showConfirmButton: false,
                toast: true,
                position: 'top-end'
            });
        }
    });

    // --- Dynamic Album Resizing ---
    let resizeTimeout;
    $(window).on('resize', function() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            $('.album').each(function() {
                const $album = $(this);
                if ($album.turn('is')) {
                    const $container = $album.closest('.public-album-item');
                    if ($container.length) {
                        const { width, height } = getAlbumSize($container);
                        $album.turn('size', width, height).turn('center');
                    }
                }
            });
        }, 250);
    });

    // --- Wishlist Contact Buttons Logic ---
    $(document).on('click', '#btn-wishlist-whatsapp', function() {
        if (!window.currentCardData) return;
        const contact = window.currentStoreContact;
        if (!contact || !contact.whatsapp) {
            Swal.fire({
                title: 'Error',
                text: 'No hay WhatsApp configurado para este vendedor.',
                icon: 'error',
                toast: true,
                position: 'top'
            });
            return;
        }

        const message = `¡Hola! Vi tu lista de "Buscamos" en Vikingdev TCG y tengo esta carta: ${window.currentCardData.name} (${window.currentCardData.rarity || 'N/A'}). ¿Te interesa?`;
        const waNumber = contact.whatsapp.replace(/\D/g, '');
        window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`, '_blank');
    });

    $(document).on('click', '#btn-wishlist-messenger', function() {
        if (!window.currentCardData) return;
        const contact = window.currentStoreContact;
        if (!contact || !contact.messenger) {
            Swal.fire({
                title: 'Error',
                text: 'No hay Messenger configurado para este vendedor.',
                icon: 'error',
                toast: true,
                position: 'top'
            });
            return;
        }

        const message = `¡Hola! Vi tu lista de "Buscamos" en Vikingdev TCG y tengo esta carta: ${window.currentCardData.name} (${window.currentCardData.rarity || 'N/A'}). ¿Te interesa?`;
        let messengerLink = contact.messenger;
        if (!messengerLink.startsWith('http')) {
            messengerLink = `https://m.me/${messengerLink}`;
        }
        const separator = messengerLink.includes('?') ? '&' : '?';
        window.open(`${messengerLink}${separator}text=${encodeURIComponent(message)}`, '_blank');
    });
});

function filterContent(query) {
    let anyVisible = false;
    const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 0);

    if (keywords.length === 0) {
        resetFilter();
        return;
    }

    // Clear previous highlights
    $('.search-highlight').removeClass('search-highlight');

    // Filtrar álbumes
    $('.public-album-item').each(function() {
        const $albumItem = $(this);
        const albumTitle = $albumItem.find('.public-album-header').text().toLowerCase();

        // El álbum coincide si el título contiene TODOS los keywords
        let albumTitleMatch = keywords.every(k => albumTitle.includes(k));

        let firstMatchPage = -1;
        let anyCardMatches = false;

        $albumItem.find('.card-slot').each(function() {
            const $slot = $(this);
            const cardName = ($slot.attr('data-name') || '').toLowerCase();

            // La búsqueda debe ser insensible a mayúsculas/minúsculas y buscar en data-name
            const cardMatch = cardName && keywords.every(k => cardName.includes(k));

            if (cardMatch) {
                anyCardMatches = true;
                $slot.addClass('search-highlight');
                if (firstMatchPage === -1) {
                    // Usar el atributo data-page pre-calculado para mayor fiabilidad
                    firstMatchPage = parseInt($slot.attr('data-page')) || -1;
                }
            }
        });

        if (albumTitleMatch || anyCardMatches) {
            $albumItem.show();
            anyVisible = true;
            // Si hubo coincidencia en cartas, girar a la primera página que coincide usando turn.js
            if (anyCardMatches && firstMatchPage !== -1) {
                const $turnAlbum = $albumItem.find('.album');
                if ($turnAlbum.turn('is')) {
                    const currentPage = $turnAlbum.turn('page');
                    // En modo double, las páginas vienen en pares (2-3, 4-5, etc.)
                    // Verificamos si la página destino ya está visible
                    const isAlreadyVisible = (currentPage === firstMatchPage) ||
                                           (currentPage % 2 === 0 && currentPage + 1 === firstMatchPage) ||
                                           (currentPage % 2 !== 0 && currentPage - 1 === firstMatchPage && currentPage > 1);

                    if (!isAlreadyVisible) {
                        isManualPageTurn = true;
                        $turnAlbum.turn('page', firstMatchPage);
                        // Aumentamos el tiempo del flag para asegurar que termine la animación
                        setTimeout(() => { isManualPageTurn = false; }, 1500);
                    }
                }
            }
        } else {
            $albumItem.hide();
        }
    });

    // Filtrar decks
    $('.deck-public-item').each(function() {
        const $deck = $(this);
        const deckName = $deck.find('h3').text().toLowerCase();

        let deckNameMatch = keywords.every(k => deckName.includes(k));
        let anyCardMatches = false;
        let firstMatchIndex = -1;

        $deck.find('.swiper-slide').each(function(index) {
            const $slot = $(this);
            const cardName = ($slot.attr('data-name') || '').toLowerCase();
            const cardMatch = cardName && keywords.every(k => cardName.includes(k));

            if (cardMatch) {
                anyCardMatches = true;
                $slot.addClass('search-highlight');
                if (firstMatchIndex === -1) firstMatchIndex = index;
            }
        });

        if (deckNameMatch || anyCardMatches) {
            $deck.show();
            anyVisible = true;
            if (anyCardMatches && firstMatchIndex !== -1) {
                const swiperEl = $deck.find('.swiper')[0];
                if (swiperEl && swiperEl.swiper) {
                    swiperEl.swiper.slideTo(firstMatchIndex);
                }
            }
        } else {
            $deck.hide();
        }
    });

    if (anyVisible) {
        $('#no-results').hide();
    } else {
        $('#no-results').show();
    }
}

function resetFilter() {
    $('.public-album-item, .deck-public-item').show();
    $('.search-highlight').removeClass('search-highlight');
    $('#no-results').hide();
}

let card3dZtext = null;
let targetRX = 0;
let targetRY = 0;
let currentRX = 0;
let currentRY = 0;
window.card3dActive = false;
let card3dOrientationHandler = null;
let card3dTouchHandler = null;

window.updateRotation = function() {
    if (!window.card3dActive) return;

    const card3d = document.getElementById('card-3d');
    if (!card3d || !$(card3d).is(':visible')) {
        window.card3dActive = false;
        return;
    }

    const $c = $(card3d);

    // LERP for smooth motion
    currentRX += (targetRX - currentRX) * 0.1;
    currentRY += (targetRY - currentRY) * 0.1;

    const mx = (currentRY + 20) / 40;
    const my = (currentRX + 20) / 40;
    const angle = (Math.atan2(currentRX, currentRY) * 180 / Math.PI) + 135;

    // Pokemon style variables
    const px = mx * 100;
    const py = my * 100;
    const cx = (mx - 0.5) * 100;
    const cy = (my - 0.5) * 100;
    const pointerFromCenter = Math.min(Math.sqrt(cx * cx + cy * cy) / 50, 1);

    $c.css('transform', `rotateX(${currentRX}deg) rotateY(${currentRY}deg)`);

    const $holo = $c.find('.holo-layer');
    if ($holo.length > 0) {
        $holo.css('background-position', `${px}% ${py}%`);
    }

    $c.css({
        '--mx': mx,
        '--my': my,
        '--angle': `${angle}deg`,
        '--pointer-x': `${px}%`,
        '--pointer-y': `${py}%`,
        '--background-x': `${px}%`,
        '--background-y': `${py}%`,
        '--pointer-from-center': pointerFromCenter,
        '--pointer-from-top': my,
        '--pointer-from-left': mx,
        '--card-opacity': '1'
    });

    requestAnimationFrame(window.updateRotation);
}

function init3DCard() {
    const $container = $('#card-3d-container');
    const $card = $('#card-3d');
    const $zContainer = $('#z-text-container');

    if (!$zContainer.length) return;

    // Reset styles
    $card.css('transform', '');
    currentRX = 0;
    currentRY = 0;
    targetRX = 0;
    targetRY = 0;

    // Initialize ztext
    try {
        card3dZtext = new Ztextify('#z-text-container', {
            depth: "10px",
            layers: 10,
            fade: true,
            direction: "backwards",
            event: "none",
            perspective: "800px"
        });
    } catch (e) {
        console.error("Ztext init error:", e);
    }

    $container.off('mousemove mouseleave touchend');
    if (card3dTouchHandler) {
        $container[0].removeEventListener('touchmove', card3dTouchHandler);
    }

    $container.on('mousemove', (e) => {
        const rect = $container[0].getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        targetRY = ((x / rect.width) - 0.5) * 40;
        targetRX = ((y / rect.height) - 0.5) * -40;
    });

    $container.on('mouseleave', () => {
        targetRX = 0;
        targetRY = 0;
    });

    // Touch support - use native listener with {passive: false} to allow e.preventDefault()
    card3dTouchHandler = (e) => {
        const rect = $container[0].getBoundingClientRect();
        const touch = e.touches[0];
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;

        targetRY = ((x / rect.width) - 0.5) * 40;
        targetRX = ((y / rect.height) - 0.5) * -40;

        if (e.cancelable) e.preventDefault();
    };

    $container[0].addEventListener('touchmove', card3dTouchHandler, { passive: false });

    $container.on('touchend', () => {
        targetRX = 0;
        targetRY = 0;
    });

    // Device Orientation support
    if (window.DeviceOrientationEvent) {
        if (card3dOrientationHandler) {
            window.removeEventListener('deviceorientation', card3dOrientationHandler);
        }
        card3dOrientationHandler = (e) => {
            if (!window.card3dActive) return;
            if (e.gamma !== null && e.beta !== null) {
                targetRY = Math.max(-20, Math.min(20, e.gamma)) * 1.5;
                targetRX = Math.max(-20, Math.min(20, e.beta - 45)) * 1.5;
            }
        };

        // iOS 13+ requires permission
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
                .then(state => {
                    if (state === 'granted') {
                        window.addEventListener('deviceorientation', card3dOrientationHandler);
                    }
                })
                .catch(err => console.error("Gyroscope permission denied:", err));
        } else {
            window.addEventListener('deviceorientation', card3dOrientationHandler);
        }
    }

    if (!window.card3dActive) {
        window.card3dActive = true;
        requestAnimationFrame(window.updateRotation);
    }
}

// Global target values for LERP
window.set3DTarget = function(rx, ry) {
    targetRX = rx;
    targetRY = ry;
};

function openCardModal($slot) {
    const imgSrc = $slot.find("img").attr("src");

    if (!imgSrc || imgSrc.includes('placeholder')) return;

    const name = $slot.data("name") || "Carta de Colección";
    const rarity = $slot.data("rarity") || "-";
    const holo = $slot.data("holo") || "";
    const mask = $slot.data("mask") || "";
    const expansion = $slot.data("expansion") || "-";
    const condition = $slot.data("condition") || "-";
    const quantity = $slot.data("quantity") || "1";
    const price = $slot.data("price") || "-";
    const isWishlist = $slot.hasClass('wishlist-card-item');
    const notes = $slot.data("notes") || "";

    // Reset the card container with a fresh image tag and preserve holo-layer
    // Re-adding card-3d class to ensure it's always present for the rotation logic
    $("#card-3d").html(`
        <div id="z-text-container">
            <img id="expanded-image" src="${imgSrc}" alt="${name}" class="card__front">
        </div>
        <div class="holo-layer"></div>
        <div class="card__shine"></div>
        <div class="card__glare"></div>
    `).addClass("card-3d");

    const $card3d = $("#card-3d-container");
    const $card = $("#card-3d");

    // Cleanup Pokemon styles
    $card.removeClass("card masked interacting");
    $card.removeAttr("data-rarity data-trainer-gallery data-subtypes data-supertype");
    $card.css({
        '--seedx': '',
        '--seedy': '',
        '--cosmosbg': '',
        '--card-opacity': '0'
    });

    $card3d.removeClass("super-rare secret-rare ghost-rare foil rainbow starlight-rare custom-texture custom-foil active");
    $card3d.find('.holo-layer').css('--mask-url', '');

    let baseHolo = holo;
    let isCustomFoil = false;

    if (holo.startsWith('custom-foil|')) {
        isCustomFoil = true;
        baseHolo = holo.split('|')[1] || 'foil';
    }

    if (baseHolo) {
        if (POKEMON_FOILS[baseHolo]) {
            let rarityVal = POKEMON_FOILS[baseHolo];
            $card.addClass("card");

            // Handle flags based on substrings
            if (rarityVal.includes('trainer gallery')) {
                $card.attr("data-trainer-gallery", "true");
                rarityVal = rarityVal.replace('trainer gallery', '');
            } else {
                $card.removeAttr("data-trainer-gallery");
            }

            if (rarityVal.includes('supporter')) {
                $card.attr("data-subtypes", "supporter");
                rarityVal = rarityVal.replace('supporter', '');
            } else {
                $card.removeAttr("data-subtypes");
            }

            if (rarityVal.includes('pokemon')) {
                $card.attr("data-supertype", "pokémon");
                rarityVal = rarityVal.replace('pokemon', '');
            } else {
                $card.removeAttr("data-supertype");
            }

            $card.attr("data-rarity", rarityVal.trim());

            if ((isCustomFoil || baseHolo === 'custom-texture') && mask) {
                $card.addClass("masked");
                const maskVal = `url(${mask})`;
                $card.css("--mask", maskVal);
                $card.css("--mask-url", maskVal);
            }

            // Random seed for cosmos and others
            const rx = Math.random();
            const ry = Math.random();
            $card.css({
                '--seedx': rx,
                '--seedy': ry,
                '--cosmosbg': `${Math.floor(rx * 734)}px ${Math.floor(ry * 1280)}px`
            });
        } else {
            // Handle as standard holo class
            $card3d.addClass(baseHolo);
            if ((isCustomFoil || baseHolo === 'custom-texture') && mask) {
                $card.addClass("masked");
                const maskVal = `url(${mask})`;
                $card.css("--mask", maskVal);
                $card.css("--mask-url", maskVal);
            }
        }
    }

    $("#card-name").text(name);
    $("#card-rarity").text(rarity);
    $("#card-expansion").text(expansion);
    $("#card-condition").text(condition);
    $("#card-quantity").text(quantity);
    $("#card-price").text(price);

    if (isWishlist) {
        $('#wishlist-contact-buttons').css('display', 'flex');
        $('#btn-add-to-cart').hide();

        // Layout for wishlist: Rarity and Quantity visible, others hidden
        $('#card-expansion').closest('.info-item').hide();
        $('#card-condition').closest('.info-item').hide();
        $('#card-price').closest('.info-item').hide();

        $('#card-notes').text(notes || 'Sin notas adicionales.');
        $('#wishlist-info-extra').css('display', 'flex');
    } else {
        $('#wishlist-contact-buttons').hide();
        $('#btn-add-to-cart').show();

        // Restore layout for regular cards
        $('.info-item').show();
        $('#wishlist-info-extra').hide();
    }

    // Store current card data for cart integration
    window.currentCardData = {
        name,
        image_url: imgSrc,
        rarity,
        expansion,
        condition,
        price,
        quantity,
        whatsapp_link: window.currentStoreContact ? window.currentStoreContact.whatsapp : null,
        messenger_link: window.currentStoreContact ? window.currentStoreContact.messenger : null
    };

    $("#image-overlay").addClass("active");
    $("body").addClass("modal-open");

    // Defer initialization to allow DOM update
    setTimeout(() => {
        init3DCard();
        $card3d.addClass("active");
    }, 150);
}

async function switchView(view) {
    if (!view) return;

    $('.nav-btn').removeClass('active');
    $(`.nav-btn[data-view="${view}"]`).addClass('active');

    $('.view-section').removeClass('active');
    $(`#${view}-view`).addClass('active');

    if (view === 'albums') {
        $('#public-view-title').text('Colección de Álbumes');
        $('.public-header p').text('Explora nuestra selección de cartas y colecciones exclusivas.');
    } else if (view === 'sealed') {
        $('#public-view-title').text('Productos Sellados');
        $('.public-header p').text('Encuentra cajas, sobres y productos especiales de tus TCG favoritos.');
        loadPublicSealed();
    } else if (view === 'preorders') {
        $('#public-view-title').text('Preventas');
        $('.public-header p').text('Asegura tus productos antes que nadie con nuestras preventas exclusivas.');
        loadPublicPreorders();
    } else if (view === 'decks') {
        $('#public-view-title').text('Decks de Cartas');
        $('.public-header p').text('Explora nuestra selección de cartas y colecciones exclusivas.');
        loadPublicDecks();
    } else if (view === 'wishlist') {
        $('#public-view-title').text('Buscamos lo siguiente');
        $('.public-header p').text('Si tienes alguno de estos productos ponte en coontacto con nosotros');
        loadPublicWishlist();
    } else if (view === 'events') {
        $('#public-view-title').text('Eventos');
        $('.public-header p').text('Participa en nuestros eventos para ganar premios increíbles.');
        loadPublicEvents();
    }

    const url = new URL(window.location);
    url.searchParams.set('view', view);
    window.history.pushState({}, '', url);
}

async function loadStoreData() {
    const urlParams = new URLSearchParams(window.location.search);
    const storeName = urlParams.get('store');
    const userName = urlParams.get('user');

    if (!storeName && !userName) {
        $('#public-store-name').hide();
        hideLoading();
        return;
    }

    try {
        let query = _supabase
            .from('usuarios')
            .select('id, username, store_name, whatsapp_link, messenger_link, store_logo, is_store');

        if (storeName) {
            query = query.eq('store_name', storeName);
        } else {
            query = query.eq('username', userName);
        }

        const { data: userData, error: userError } = await query.single();

        if (userError || !userData) {
            const errorMsg = storeName ? 'Tienda no encontrada.' : 'Usuario no encontrado.';
            $('#albums-container').html(`<div class="error">${errorMsg}</div>`);
            hideLoading();
            return;
        }

        // Check localStorage first for guest selection
        const localSpirit = localStorage.getItem('selected_spirit');
        if (localSpirit) {
            window.currentSpirit = JSON.parse(localSpirit);
        } else {
            // Fetch selected spirit from DB (owner's preference or default)
            const { data: spiritRef } = await _supabase
                .from('usuarios')
                .select('selected_spirit_id')
                .eq('id', userData.id)
                .single();

            if (spiritRef && spiritRef.selected_spirit_id) {
                const { data: spiritData } = await _supabase
                    .from('spirits')
                    .select('*')
                    .eq('id', spiritRef.selected_spirit_id)
                    .single();
                if (spiritData) window.currentSpirit = spiritData;
            }
        }

        if (userData.is_store) {
            if (userData.store_logo) {
                $('#public-store-logo').show().attr('src', userData.store_logo);
                $('#public-store-icon').hide();
            } else {
                $('#public-store-logo').hide();
                $('#public-store-icon').show();
            }
            $('#public-store-name').text(`Tienda: ${userData.store_name}`).show();
        } else {
            $('#public-store-logo').hide();
            $('#public-store-icon').hide();
            $('#public-store-name').text(userData.username).show();
        }

        window.currentStoreId = userData.id;
        window.currentStoreContact = {
            whatsapp: userData.whatsapp_link,
            messenger: userData.messenger_link
        };

        // Update cart link to include store name or user name
        const identifier = userData.is_store ? `store=${encodeURIComponent(userData.store_name)}` : `user=${encodeURIComponent(userData.username)}`;
        $('#cart-btn').attr('href', `carrito.html?${identifier}`);

        // Fetch additional data for CompanionBot
        const [{ data: botMessages }, { data: sealedProducts }] = await Promise.all([
            _supabase.from('bot_messages').select('*').eq('user_id', userData.id).eq('is_active', true).or('view_type.eq.public,view_type.eq.both'),
            _supabase.from('sealed_products').select('id').eq('user_id', userData.id).limit(1)
        ]);

        window.currentStoreDataForBot = {
            user: userData,
            customMessages: botMessages,
            hasSealed: sealedProducts && sealedProducts.length > 0
        };

        // Initialize companion bot first for speed
        initFloatingCompanion();

        // Start loading content in parallel
        loadPublicAlbums(userData.id);
    } catch (e) {
        console.error("Error in loadStoreData:", e);
        hideLoading();
    }
}

async function loadPublicPreorders() {
    let userId = window.currentStoreId;
    if (!userId) {
        const urlParams = new URLSearchParams(window.location.search);
        const storeName = urlParams.get('store');
        const userName = urlParams.get('user');
        if (!storeName && !userName) return;
        let query = _supabase.from('usuarios').select('id');
        if (storeName) query = query.eq('store_name', storeName);
        else query = query.eq('username', userName);
        const { data: user } = await query.single();
        if (user) userId = user.id;
    }
    if (!userId) return;

    $('#preorders-container').html('<div class="loading">Cargando preventas...</div>');

    try {
        const { data: preorders, error } = await _supabase
            .from('preorders')
            .select('*')
            .eq('user_id', userId)
            .eq('is_public', true)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!preorders || preorders.length === 0) {
            $('#preorders-container').html('<div class="empty">No hay preventas disponibles.</div>');
            return;
        }

        $('#preorders-container').empty();
        preorders.forEach(preorder => {
            const $item = $(`
                <div class="deck-public-item sealed-product-item">
                    <div class="product-image-container">
                        <img src="${preorder.image_url || 'https://via.placeholder.com/300x150?text=Sin+Imagen'}"
                             alt="${preorder.name}" class="sealed-product-img">
                    </div>
                    <h3 style="margin: 10px 0; font-size: 1.1rem; min-height: 2.4em; display: flex; align-items: center; justify-content: center;">${preorder.name}</h3>
                    <div style="color: #00d2ff; font-weight: bold; font-size: 1.2rem;">${preorder.price || 'Consultar'}</div>
                    <div style="color: #ff4757; font-size: 0.85rem; font-weight: 600; margin-bottom: 15px;">Límite: ${preorder.payment_deadline || '-'}</div>
                    <button class="btn btn-add-preorder-cart" style="width: 100%;">
                        <i class="fas fa-cart-plus"></i> Agregar al Carrito
                    </button>
                </div>
            `);

            $item.find('.btn-add-preorder-cart').click(function(e) {
                e.stopPropagation();
                Cart.add({
                    name: preorder.name,
                    image_url: preorder.image_url,
                    price: preorder.price,
                    tcg: preorder.tcg,
                    deadline: preorder.payment_deadline
                });
                Swal.fire({
                    title: '¡Añadido!',
                    text: `${preorder.name} se ha agregado al carrito.`,
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false,
                    toast: true,
                    position: 'top-end'
                });
            });

            $('#preorders-container').append($item);
        });

    } catch (e) {
        console.error("Error loading preorders:", e);
        $('#preorders-container').html('<div class="error">Error al cargar preventas.</div>');
    } finally {
        hideLoading();
    }
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

    $container.on('click', function(e) {
        if (window.isCompanionDragging) return;
        e.stopPropagation();
        $('#companion-menu').toggleClass('active');
    });

    // Initialize CompanionBot Tips
    if (typeof CompanionBot === 'function') {
        const bot = new CompanionBot({
            supabase: _supabase,
            userId: window.currentStoreId,
            userType: 'public',
            customMessages: window.currentStoreDataForBot ? window.currentStoreDataForBot.customMessages : [],
            onAction: (msg) => {
                if (msg.type === 'album_link' && msg.redirect_url) {
                    switchView('albums');
                    setTimeout(() => {
                        const albumTitle = msg.redirect_url.toLowerCase();
                        $('.public-album-item').each(function() {
                            const title = $(this).find('.public-album-header').text().toLowerCase();
                            if (title.includes(albumTitle)) {
                                this.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                return false;
                            }
                        });
                    }, 600);
                } else if (msg.type === 'pre_sales') {
                    switchView('preorders');
                } else if (msg.redirect_url && msg.redirect_url.startsWith('http')) {
                    window.open(msg.redirect_url, '_blank');
                }
            }
        });
        bot.init();
        window.botInstance = bot;
    }
}

async function loadPublicAlbums(userId) {
    const isAlbumsView = $('.nav-btn[data-view="albums"]').hasClass('active');
    if (isAlbumsView) showLoading('Cargando interfaz...');
    try {
        let query = _supabase
            .from('albums')
            .select('*')
            .eq('user_id', userId)
            .order('id', { ascending: true });

        let { data: albums, error } = await query;

        // Fallback if query failed (might be schema mismatch)
        if (error) {
            console.warn("Error al cargar álbumes, intentando consulta básica.");
            const retry = await _supabase
                .from('albums')
                .select('*')
                .eq('user_id', userId)
                .order('id', { ascending: true });
            albums = retry.data;
            error = retry.error;
        }

        if (albums) {
            // Filtrar en JS para tratar null como público (true)
            // Solo ocultamos si is_public es explícitamente false
            albums = albums.filter(a => a.is_public !== false);
            window.currentAlbums = albums;
        }

        if (error) {
            $('#albums-container').html('<div class="error">Error al cargar álbumes.</div>');
            return;
        }

        if (albums.length === 0) {
            $('#albums-container').html('<div class="empty">No hay álbumes disponibles.</div>');
            return;
        }

        $('#albums-container').empty();
        for (const album of albums) {
            await renderAlbum(album);
        }
    } catch (e) {
        console.error("Error in loadPublicAlbums:", e);
        $('#albums-container').html('<div class="error">Error al cargar la colección.</div>');
    } finally {
        setTimeout(hideLoading, 500);
    }
}

async function loadPublicDecks() {
    const urlParams = new URLSearchParams(window.location.search);
    const storeName = urlParams.get('store');
    const userName = urlParams.get('user');
    if (!storeName && !userName) return;

    $('#decks-container').html('<div class="loading">Cargando decks...</div>');

    try {
        let query = _supabase.from('usuarios').select('id');
        if (storeName) {
            query = query.eq('store_name', storeName);
        } else {
            query = query.eq('username', userName);
        }
        const { data: user } = await query.single();

        if (!user) {
            return;
        }

        let deckQuery = _supabase
            .from('decks')
            .select(`
                *,
                deck_cards (*)
            `)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .order('position', { foreignTable: 'deck_cards', ascending: true });

        let { data: decks, error } = await deckQuery;

        // Fallback if query failed
        if (error) {
            console.warn("Error al cargar decks, intentando consulta básica.");
            const retry = await _supabase
                .from('decks')
                .select(`
                    *,
                    deck_cards (*)
                `)
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .order('position', { foreignTable: 'deck_cards', ascending: true });
            decks = retry.data;
            error = retry.error;
        }

        if (decks) {
            // Filtrar en JS para tratar null como público (true)
            decks = decks.filter(d => d.is_public !== false);
        }

        if (error || !decks) {
            $('#decks-container').html('<div class="error">No se pudieron cargar los decks.</div>');
            return;
        }

        $('#decks-container').empty();
        if (decks.length === 0) {
            $('#decks-container').html('<div class="empty">Esta tienda aún no tiene decks públicos.</div>');
            return;
        }

        decks.forEach(deck => {
            const deckId = `deck-swiper-${deck.id}`;

            // Calculate Total Sum
            const totalSum = (deck.deck_cards || []).reduce((sum, card) => {
                const priceStr = card.price || '0';
                const price = parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 0;
                const qty = parseInt(card.quantity) || 1;
                return sum + (price * qty);
            }, 0);

            const hasSpecialPrice = deck.use_special_price && deck.special_price;
            const priceDisplay = hasSpecialPrice
                ? `<div class="deck-price-container">
                    <span class="price-total price-strikethrough">$${totalSum.toFixed(2)}</span>
                    <span class="price-special">${deck.special_price}</span>
                   </div>`
                : `<div class="deck-price-container">
                    <span class="price-total">$${totalSum.toFixed(2)}</span>
                   </div>`;

            const $deckItem = $(`
                <div class="deck-public-item">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                        <div>
                            <h3 style="margin-bottom: 5px;">${deck.name}</h3>
                            ${priceDisplay}
                        </div>
                        <button class="btn btn-sm btn-sort-public-deck" title="Ordenar por Nombre"><i class="fas fa-sort-alpha-down"></i></button>
                    </div>
                    <div class="container">
                        <div class="swiper swiperyg ${deckId}">
                            <div class="swiper-wrapper">
                                ${deck.deck_cards.map(card => `
                                    <div class="swiper-slide card-slot"
                                         data-name="${card.name || ''}"
                                         data-rarity="${card.rarity || ''}"
                                         data-holo="${card.holo_effect || ''}"
                                         data-mask="${card.custom_mask_url || ''}"
                                         data-expansion="${card.expansion || ''}"
                                         data-condition="${card.condition || ''}"
                                         data-quantity="${card.quantity || '1'}"
                                         data-price="${card.price || ''}">
                                        <img src="${card.image_url}" alt="${card.name || 'Carta'}" />
                                        <div class="zoom-btn"><i class="fas fa-search-plus"></i></div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `);

            $('#decks-container').append($deckItem);

            // El manejo de clics se mantiene normal, la prioridad táctil
            // ya se maneja con el listener global en fase de captura.
            $deckItem.find('.zoom-btn').on('click', function(e) {
                e.stopPropagation();
                openCardModal($(this).closest('.card-slot'));
            });

            new Swiper(`.${deckId}`, {
                effect: "cards",
                grabCursor: true,
                perSlideOffset: 8,
                perSlideRotate: 2,
                rotate: true,
                slideShadows: true,
                preventClicksPropagation: false,
                on: {
                    click: function(s, e) {
                        if (!isDragging) {
                            const $slot = $(e.target).closest('.card-slot');
                            if ($slot.length) {
                                const isMobile = window.innerWidth <= 640;
                                if (isMobile) {
                                    if (!$(e.target).closest('.zoom-btn').length) return;
                                }
                                openCardModal($slot);
                            }
                        }
                    }
                }
            });
        });
    } catch (e) {
        console.error("Error in loadPublicDecks:", e);
        $('#decks-container').html('<div class="error">Error al cargar los decks.</div>');
    } finally {
        setTimeout(hideLoading, 500);
    }
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

async function checkSession() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) {
        const { data: user } = await _supabase
            .from('usuarios')
            .select('id, username, store_name, store_logo, is_store, role')
            .eq('id', session.user.id)
            .single();

        try {
            if (user) {
                localStorage.setItem('tcg_session', JSON.stringify(user));
                if (user.is_store) {
                    $('#dropdown-user-logo').show().attr('src', user.store_logo || 'https://midominio.com/placeholder-logo.png');
                    $('#dropdown-user-name').text(user.store_name || user.username);
                    $('#dropdown-user-role').hide();
                } else {
                    $('#dropdown-user-logo').hide();
                    $('#dropdown-user-name').text(user.username);
                    $('#dropdown-user-role').hide();
                }
            }
        } catch (e) {
            console.error("Error parsing session:", e);
        }
    } else {
        $('#dropdown-user-logo').hide();
        $('#dropdown-user-name').text('Invitado');
        $('#dropdown-user-role').text('Invitado').show();
    }
}

async function loadPublicSpirits() {
    // El usuario no quiere pantalla de carga completa (loading screen) aquí
    $('#public-spirits-grid').html('<div class="loading">Cargando interfaz...</div>');

    const { data: spirits, error } = await _supabase
        .from('spirits')
        .select('*')
        .order('name', { ascending: true });

    if (error || !spirits) {
        $('#public-spirits-grid').html('<div class="error">Error al cargar compañeros.</div>');
        return;
    }

    // Filtrar solo públicos
    const visibleSpirits = spirits.filter(s => s.is_public !== false);

    const selectedId = window.currentSpirit ? window.currentSpirit.id : null;

    if (visibleSpirits.length === 0) {
        $('#public-spirits-grid').html('<div class="empty">No hay compañeros disponibles.</div>');
        return;
    }

    const $grid = $('#public-spirits-grid');
    $grid.empty();

    window.dispatchEvent(new CustomEvent('hide-loading'));

    visibleSpirits.forEach(spirit => {
        const isSelected = spirit.id == selectedId;

        const $card = $(`
            <div class="spirit-card ${isSelected ? 'selected' : ''}"
                 data-id="${spirit.id}"
                 data-gltf="${spirit.gltf_url}"
                 data-name="${spirit.name}">
                <div class="badge-selected">Actual</div>
                <model-viewer
                    src="${spirit.gltf_url}"
                    loading="lazy"
                    camera-controls
                    shadow-intensity="1"
                    environment-image="neutral"
                    exposure="1.2">
                </model-viewer>
                <h3>${spirit.name}</h3>
                <div class="zoom-btn" style="display: flex;"><i class="fas fa-search-plus"></i></div>
            </div>
        `);

        $grid.append($card);
    });
}

function getAlbumSize($albumContainer) {
    const isMobile = window.innerWidth <= 640;
    let width = 600;
    let height = 420;

    if (isMobile) {
        // En móvil usamos el ancho del contenedor con un pequeño margen
        const containerWidth = $albumContainer.width() || $(window).width();
        const availableWidth = Math.min(600, containerWidth - 20);
        width = availableWidth;
        height = Math.floor(width * (420 / 600));
    }
    return { width, height };
}

async function renderAlbum(album) {
    const $albumContainer = $(`
        <div class="public-album-item">
            <div class="public-album-header">
                <i class="fas fa-book-open"></i> ${album.title}
            </div>
            <div class="album-wrapper">
                <div id="album-${album.id}" class="album"></div>
            </div>
        </div>
    `);

    const $albumDiv = $albumContainer.find('.album');
    $('#albums-container').append($albumContainer);

    let { data: pages } = await _supabase
        .from('pages')
        .select('*')
        .eq('album_id', album.id)
        .order('page_index', { ascending: true });

    if (!pages) pages = [];

    const coverImg = album.cover_image_url;
    const coverColor = album.cover_color || '#1a1a1a';
    let pageCount = 1;

    if (coverImg) {
        $albumDiv.append(`<div class="page album-page cover-page" data-page-num="${pageCount}"><img src="${coverImg}"></div>`);
    } else {
        $albumDiv.append(`
            <div class="page album-page cover-page" data-page-num="${pageCount}">
                <div class="textured-cover" style="background-color: ${coverColor}">
                    <h2>${album.title}</h2>
                </div>
            </div>
        `);
    }

    for (const page of pages) {
        pageCount++;
        const $pageDiv = $(`<div class="page album-page" data-page-num="${pageCount}"></div>`);
        const $grid = $('<div class="grid-container"></div>');

        const { data: slots } = await _supabase
            .from('card_slots')
            .select('*')
            .eq('page_id', page.id)
            .order('slot_index', { ascending: true });

        for (let i = 0; i < 9; i++) {
            const slotData = slots ? slots.find(s => s.slot_index === i) : null;
            const $slot = $('<div class="card-slot"></div>');

            if (slotData) {
                // El nombre de la carta se almacena como atributo data-name para búsquedas (invisible en UI)
                // data-page almacena el número de página para navegación directa
                $slot.attr({
                    'data-name': slotData.name || '',
                    'data-page': pageCount,
                    'data-rarity': slotData.rarity || '',
                    'data-holo': slotData.holo_effect || '',
                    'data-mask': slotData.custom_mask_url || '',
                    'data-expansion': slotData.expansion || '',
                    'data-condition': slotData.condition || '',
                    'data-quantity': slotData.quantity || '',
                    'data-price': slotData.price || ''
                });
                if (slotData.image_url) {
                    const cardAlt = slotData.name || 'Carta';
                    $slot.append(`<img src="${slotData.image_url}" class="tcg-card" alt="${cardAlt}">`);
                    const $zoomBtn = $('<div class="zoom-btn"><i class="fas fa-search-plus"></i></div>');

                    // Prioridad para móvil: el listener global captura el touchstart.
                    // Aquí manejamos el clic final para abrir el modal.
                    $zoomBtn.on('click', function(e) {
                        e.stopPropagation();
                        openCardModal($(this).closest('.card-slot'));
                    });

                    $slot.append($zoomBtn);
                }
            }
            $grid.append($slot);
        }

        $pageDiv.append($grid).appendTo($albumDiv);
    }

    // Asegurarnos de que el álbum siempre termine con una contraportada independiente.
    // Para que la contraportada quede al final (lado izquierdo en double-page),
    // el total de páginas debe ser par.
    // Total = 1 (portada) + pages.length (internas) + [1 si hay relleno] + 1 (contraportada).
    // Si (1 + pages.length + 1) es impar (es decir, pages.length es impar), añadimos relleno.
    if (pages.length % 2 !== 0) {
        pageCount++;
        $albumDiv.append(`<div class="page album-page" data-page-num="${pageCount}"></div>`);
    }

    // Añadir contraportada siempre
    pageCount++;
    const backImg = album.back_image_url;
    const backColor = album.back_color || '#1a1a1a';

    if (backImg) {
        $albumDiv.append(`<div class="page album-page cover-page" data-page-num="${pageCount}"><img src="${backImg}"></div>`);
    } else {
        $albumDiv.append(`
            <div class="page album-page cover-page" data-page-num="${pageCount}">
                <div class="textured-cover" style="background-color: ${backColor}"></div>
            </div>
        `);
    }

    const $images = $albumDiv.find('img');
    let loadedCount = 0;
    let turnInitialized = false;

    const initTurn = () => {
        if (turnInitialized) return;
        turnInitialized = true;

        const isMobile = window.innerWidth <= 640;
        const { width, height } = getAlbumSize($albumContainer);

        $albumDiv.turn({
            width: width,
            height: height,
            autoCenter: true,
            gradients: true,
            acceleration: true,
            display: 'double',
            elevation: 50,
            duration: 800, // Duración equilibrada para rapidez y suavidad
            cornerSize: isMobile ? 50 : 100, // Menor área en móvil para evitar tirones accidentales
            when: {
                start: function(event, pageObject, corner) {
                    if (!corner && !isManualPageTurn) {
                        event.preventDefault();
                        return;
                    }
                },
                turning: function() {
                    $(this).addClass('is-turning');
                },
                turned: function() {
                    $(this).removeClass('is-turning');
                    // Forzamos el re-ajuste y centrado para asegurar que la hoja quede bien anclada
                    const $el = $(this);
                    setTimeout(() => {
                        $el.turn('resize').turn('center');
                    }, 0);
                }
            }
        });
    };

    if ($images.length === 0) setTimeout(initTurn, 150);
    else {
        $images.on('load error', () => { if (++loadedCount >= $images.length) setTimeout(initTurn, 200); });
        setTimeout(initTurn, 1500);
    }

    // Si ya hay una búsqueda activa al terminar de cargar el álbum, aplicarla
    const currentQuery = $('#search-input').val().trim();
    if (currentQuery) {
        setTimeout(() => { filterContent(currentQuery); }, 2000);
    }
}

async function loadPublicSealed() {
    let userId = window.currentStoreId;
    if (!userId) {
        const urlParams = new URLSearchParams(window.location.search);
        const storeName = urlParams.get('store');
        const userName = urlParams.get('user');
        if (!storeName && !userName) return;
        let query = _supabase.from('usuarios').select('id');
        if (storeName) query = query.eq('store_name', storeName);
        else query = query.eq('username', userName);
        const { data: user } = await query.single();
        if (user) userId = user.id;
    }
    if (!userId) return;

    $('#sealed-container').html('<div class="loading">Cargando productos sellados...</div>');

    try {
        const { data: products, error } = await _supabase
            .from('sealed_products')
            .select('*')
            .eq('user_id', userId)
            .eq('is_public', true)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!products || products.length === 0) {
            $('#sealed-container').html('<div class="empty">No hay productos sellados disponibles.</div>');
            return;
        }

        $('#sealed-container').empty();
        products.forEach(product => {
            const $item = $(`
                <div class="deck-public-item sealed-product-item">
                    <div class="product-image-container">
                        <img src="${product.image_url || 'https://via.placeholder.com/300x150?text=Sin+Imagen'}"
                             alt="${product.name}" class="sealed-product-img">
                    </div>
                    <h3 style="margin: 10px 0; font-size: 1.1rem; min-height: 2.4em; display: flex; align-items: center; justify-content: center;">${product.name}</h3>
                    <div style="color: #00d2ff; font-weight: bold; font-size: 1.2rem; margin-bottom: 15px;">${product.price || 'Consultar'}</div>
                    <button class="btn btn-add-sealed-cart" style="width: 100%;">
                        <i class="fas fa-cart-plus"></i> Agregar al Carrito
                    </button>
                </div>
            `);

            $item.find('.btn-add-sealed-cart').click(function(e) {
                e.stopPropagation();
                Cart.add({
                    name: product.name,
                    image_url: product.image_url,
                    price: product.price,
                    tcg: product.tcg
                });
                Swal.fire({
                    title: '¡Añadido!',
                    text: `${product.name} se ha agregado al carrito.`,
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false,
                    toast: true,
                    position: 'top-end'
                });
            });

            $('#sealed-container').append($item);
        });

    } catch (e) {
        console.error("Error loading sealed products:", e);
        $('#sealed-container').html('<div class="error">Error al cargar productos.</div>');
    } finally {
        hideLoading();
    }
}

async function loadPublicEvents() {
    let userId = window.currentStoreId;
    if (!userId) {
        const urlParams = new URLSearchParams(window.location.search);
        const storeName = urlParams.get('store');
        const userName = urlParams.get('user');

        if (storeName || userName) {
            let query = _supabase.from('usuarios').select('id');
            if (storeName) query = query.eq('store_name', storeName);
            else query = query.eq('username', userName);
            const { data: user } = await query.single();
            if (user) {
                userId = user.id;
                window.currentStoreId = userId;
            }
        }
    }
    if (!userId) return;

    $('#events-container').html('<div class="loading">Cargando...</div>');

    try {
        const { data: events, error } = await _supabase.from('events').select('*').eq('user_id', userId).eq('is_public', true).order('event_date', { ascending: true });

        if (error) throw error;

        if (!events || events.length === 0) {
            $('#events-container').html('<div class="empty">No hay eventos programados.</div>');
            return;
        }

        $('#events-container').empty();
        events.forEach((item, index) => {
            const now = new Date();
            const eventDate = item.event_date ? new Date(item.event_date) : null;
            const isPast = eventDate && eventDate < now;
            const itemId = `event-${item.id}`;

            // Check if ending soon (within 2 days)
            let endingSoonHtml = "";
            if (eventDate && !isPast) {
                const diffTime = eventDate - now;
                const diffDays = diffTime / (1000 * 60 * 60 * 24);
                if (diffDays <= 2) {
                    endingSoonHtml = `<div class="ending-soon-warning"><i class="fas fa-exclamation-triangle"></i> Queda poco para que este evento termine</div>`;
                }
            }

            const typeClass = item.type ? `public-event-${item.type}` : 'public-event-informativo';
            const typeLabel = item.type ? item.type.charAt(0).toUpperCase() + item.type.slice(1) : 'Evento';

            const $card = $(`
                <div id="${itemId}" class="deck-public-item sealed-product-item public-event-card ${typeClass}"
                     style="${isPast ? 'opacity: 0.6; filter: grayscale(1);' : ''}; animation-delay: ${index * 0.1}s;">
                    ${item.image_url ? `
                    <div class="product-image-container">
                        <img src="${item.image_url}" class="sealed-product-img">
                    </div>
                    ` : ''}
                    <div class="event-content-wrapper" style="padding: 15px; flex: 1; display: flex; flex-direction: column;">
                        ${item.name ? `<h3 style="margin: 10px 0;">${item.name}</h3>` : ''}
                        ${item.event_date ? `
                        <div style="font-size: 0.85rem; color: #00d2ff; font-weight: bold; margin-bottom: 5px;">
                            <i class="fas fa-calendar-day"></i> ${eventDate.toLocaleString()}
                        </div>
                        ` : ''}
                        ${endingSoonHtml}
                        ${item.description ? `<p style="font-size: 0.85rem; color: #aaa; text-align: left; line-height: 1.5; margin-top: 10px;">${item.description}</p>` : ''}
                        ${isPast ? '<div style="color: #666; font-weight: bold; text-transform: uppercase; font-size: 0.8rem; margin-top: auto; padding-top: 15px;">Finalizado</div>' : ''}
                    </div>
                </div>
            `);
            $('#events-container').append($card);
        });
    } catch (e) {
        console.error(e);
        $('#events-container').html('<div class="error">Error al cargar la sección.</div>');
    } finally {
        hideLoading();
    }
}


async function loadPublicWishlist() {
    let userId = window.currentStoreId;

    if (!userId) {
        const urlParams = new URLSearchParams(window.location.search);
        const storeName = urlParams.get('store');
        const userName = urlParams.get('user');
        if (!storeName && !userName) return;

        let query = _supabase.from('usuarios').select('id');
        if (storeName) query = query.eq('store_name', storeName);
        else query = query.eq('username', userName);

        const { data: user } = await query.single();
        if (user) userId = user.id;
    }

    if (!userId) return;

    $('#wishlist-container').html('<div class="loading">Cargando lista de deseos...</div>');

    try {
        const { data: wishlist, error } = await _supabase
            .from('wishlist')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!wishlist || wishlist.length === 0) {
            $('#wishlist-container').html('<div class="empty">Esta tienda no tiene una lista de deseos pública.</div>');
            return;
        }

        $('#wishlist-container').empty();
        wishlist.forEach(item => {
            const $item = `
                <div class="deck-public-item wishlist-card-item card-slot"
                     data-name="${item.name}"
                     data-rarity="${item.rarity || '-'}"
                     data-notes="${item.notes || ''}"
                     data-quantity="${item.quantity || '1'}"
                     style="${item.obtained ? 'opacity: 0.5;' : ''}">
                    <h3>${item.name}</h3>
                    <img src="${item.image_url}" style="width: 100%; border-radius: 12px; margin-bottom: 15px;">
                    <div style="font-size: 0.9rem; color: #aaa; margin-bottom: 10px;">
                        ${item.rarity ? `<div>Rareza: ${item.rarity}</div>` : ''}
                        ${item.quantity > 1 ? `<div>Cantidad: ${item.quantity}</div>` : ''}
                        ${item.obtained ? '<div style="color: #00ff88; font-weight: bold;">¡Ya conseguida!</div>' : ''}
                    </div>
                    <div class="zoom-btn" style="display: flex;"><i class="fas fa-search-plus"></i></div>
                </div>
            `;

            const $el = $($item);

            // Make entire card clickable
            $el.click(function(e) {
                if (isDragging) return;
                openCardModal($el);
            });

            // Still allow zoom-btn for consistency
            $el.find('.zoom-btn').click(function(e) {
                e.stopPropagation();
                openCardModal($el);
            });

            $('#wishlist-container').append($el);
        });
    } catch (e) {
        console.error("Error loading wishlist:", e);
        $('#wishlist-container').html('<div class="error">Error al cargar los deseos.</div>');
    } finally {
        hideLoading();
    }
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

// Sort buttons logic for public view
$(document).on('click', '.btn-sort-public-deck', function() {
    const $deckItem = $(this).closest('.deck-public-item');
    const $wrapper = $deckItem.find('.swiper-wrapper');
    const $slides = $wrapper.children('.swiper-slide').get();

    $slides.sort(function(a, b) {
        const nameA = $(a).attr('data-name').toUpperCase();
        const nameB = $(b).attr('data-name').toUpperCase();
        return (nameA < nameB) ? -1 : (nameA > nameB) ? 1 : 0;
    });

    $.each($slides, function(i, slide) {
        $wrapper.append(slide);
    });

    // Update Swiper
    const swiperEl = $deckItem.find('.swiper')[0];
    if (swiperEl && swiperEl.swiper) {
        swiperEl.swiper.update();
        swiperEl.swiper.slideTo(0);
    }

    Swal.fire({
        icon: 'success',
        title: 'Ordenado por nombre',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000
    });
});

async function showGeneralEventDetails(id) {
    try {
        const { data: event, error } = await _supabase.from('events').select('*').eq('id', id).single();
        if (error) throw error;

        $('#ed-name').text(event.name);
        $('#ed-desc').text(event.description || 'Sin descripción.');
        if (event.image_url) {
            $('#ed-image').attr('src', event.image_url).show();
        } else {
            $('#ed-image').hide();
        }

        $('#event-details-overlay').addClass('active');
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'No se pudieron cargar los detalles del evento.', 'error');
    }
}
