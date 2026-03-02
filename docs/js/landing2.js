$(document).ready(async function() {
    await checkSession();
    // initTheme(); // Disabled for index2.html
    loadStoresSlider();
    updateCartCount();

    // --- Smooth Scroll for Registrarse ---
    $('a[href="#join-section"]').click(function(e) {
        e.preventDefault();
        const target = $('#join-section');
        if (target.length) {
            $('html, body').animate({
                scrollTop: target.offset().top - 80
            }, 800);
        }
    });

    // --- Auth Modal Toggling ---
    $('#btn-cta-register').click(function(e) {
        e.preventDefault();
        $('#auth-modal').addClass('active');
        showRegister();
    });

    $('#close-auth-modal, #auth-modal').click(function(e) {
        if (e.target === this || $(e.target).attr('id') === 'close-auth-modal') {
            $('#auth-modal').removeClass('active');
        }
    });

    $('#link-show-register').click(function(e) {
        e.preventDefault();
        showRegister();
    });

    $('#link-show-login, #link-forgot-to-login').click(function(e) {
        e.preventDefault();
        showLogin();
    });

    $('#link-show-forgot').click(function(e) {
        e.preventDefault();
        showForgot();
    });

    function showLogin() {
        $('#register-view').hide();
        $('#forgot-view').hide();
        $('#login-view').show();
    }

    function showRegister() {
        $('#login-view').hide();
        $('#forgot-view').hide();
        $('#register-view').show();
    }

    function showForgot() {
        $('#login-view').hide();
        $('#register-view').hide();
        $('#forgot-view').show();
    }

    // --- Authentication ---
    $('#btn-login').click(handleLogin);
    $('#btn-register').click(handleRegister);
    $('#btn-forgot-password').click(handleForgotPassword);

    async function handleLogin() {
        const userInput = $('#login-username').val().trim();
        const password = $('#login-password').val().trim();

        if (!userInput || !password) {
            Swal.fire({
                title: 'Atención',
                text: 'Por favor, completa todos los campos',
                icon: 'warning',
                position: 'top'
            });
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
            Swal.fire({
                title: 'Error',
                text: 'Error al iniciar sesión: ' + error.message,
                icon: 'error',
                position: 'top'
            });
        } else {
            const { data: profile } = await _supabase
                .from('usuarios')
                .select('id, username, store_name, store_logo, is_store, role')
                .eq('id', data.user.id)
                .single();

            localStorage.setItem('tcg_session', JSON.stringify(profile));
            Swal.fire({
                title: '¡Bienvenido!',
                text: 'Has iniciado sesión correctamente',
                icon: 'success',
                timer: 1500,
                showConfirmButton: false
            }).then(() => {
                location.reload();
            });
        }
    }

    async function handleForgotPassword() {
        const userInput = $('#forgot-username').val().trim();

        if (!userInput) {
            Swal.fire({
                title: 'Atención',
                text: 'Por favor, introduce tu nombre de usuario',
                icon: 'warning',
                position: 'top'
            });
            return;
        }

        let emailToUse = userInput;

        if (!userInput.includes('@')) {
            // Attempt to find the real email in the 'usuarios' table
            const { data: userRow } = await _supabase
                .from('usuarios')
                .select('email')
                .eq('username', userInput)
                .maybeSingle();

            if (userRow && userRow.email) {
                emailToUse = userRow.email;
            } else {
                // Fallback to our convention
                emailToUse = `${userInput}@tcgdual.com`;
            }
        }

        const { error } = await _supabase.auth.resetPasswordForEmail(emailToUse, {
            redirectTo: window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/perfil.html'),
        });

        if (error) {
            Swal.fire('Error', 'No se pudo enviar el correo de restablecimiento: ' + error.message, 'error');
        } else {
            Swal.fire({
                title: '¡Correo Enviado!',
                text: 'Revisa tu bandeja de entrada para restablecer tu contraseña.',
                icon: 'success'
            }).then(() => {
                showLogin();
            });
        }
    }

    async function handleRegister() {
        const email = $('#reg-email').val().trim();
        const username = $('#reg-username').val().trim();
        const password = $('#reg-password').val().trim();

        if (!email || !username || !password) {
            Swal.fire({
                title: 'Atención',
                text: 'Por favor, completa todos los campos',
                icon: 'warning',
                position: 'top'
            });
            return;
        }

        const { data, error } = await _supabase.auth.signUp({
            email,
            password,
            options: {
                data: { username }
            }
        });

        if (error) {
            Swal.fire({
                title: 'Error',
                text: 'No se pudo crear la cuenta: ' + error.message,
                icon: 'error',
                position: 'top'
            });
        } else {
            Swal.fire({
                title: '¡Cuenta Creada!',
                text: 'Revisa tu correo para confirmar (si está activado) o inicia sesión ahora.',
                icon: 'success',
                timer: 3000,
                showConfirmButton: true,
                position: 'top'
            }).then(() => {
                location.reload();
            });
        }
    }

    // --- Session & Header ---
    async function checkSession() {
        const { data: { session } } = await _supabase.auth.getSession();
        const $authItems = $('#auth-menu-items');
        $authItems.empty();

        if (session) {
            const { data: user } = await _supabase
                .from('usuarios')
                .select('id, username, store_name, store_logo, is_store, role')
                .eq('id', session.user.id)
                .single();

            if (!user) return;
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

            $authItems.append('<a href="admin.html" class="menu-item"><i class="fas fa-lock"></i> Panel Admin</a>');
            $authItems.append('<a href="#" class="menu-item logout" id="btn-logout"><i class="fas fa-sign-out-alt"></i> Cerrar Sesión</a>');
        } else {
            $('#dropdown-user-name').text('Invitado');
            $('#dropdown-user-role').text('Invitado');
            $authItems.append('<a href="#" class="menu-item" id="btn-menu-login"><i class="fas fa-sign-in-alt"></i> Iniciar Sesión</a>');
        }
    }

    $(document).on('click', '#btn-logout', async function(e) {
        e.preventDefault();
        await _supabase.auth.signOut();
        localStorage.removeItem('tcg_session');
        location.reload();
    });

    $(document).on('click', '#btn-menu-login', function(e) {
        e.preventDefault();
        $('#auth-modal').addClass('active');
        showLogin();
        $('#user-dropdown').removeClass('active');
    });

    // --- Floating Panel Logic ---
    $('#avatar-btn').click(function(e) {
        e.stopPropagation();
        $('#user-dropdown').toggleClass('active');
    });

    $(document).on('click', function(e) {
        if (!$(e.target).closest('.user-menu-container').length) {
            $('#user-dropdown').removeClass('active');
        }
    });

    // Theme logic removed to keep index2.html pastel

    // --- Slider Logic ---
    window.allStoresData = [];

    async function loadStoresSlider() {
        const $wrapper = $('#stores-slider-wrapper');
        $wrapper.html('<div class="loading">Cargando tiendas...</div>');

        const { data: stores, error } = await _supabase
            .from('usuarios')
            .select('id, username, store_name, store_logo, ubicacion, horario, is_store')
            .eq('is_store', true);

        if (error || !stores || stores.length === 0) {
            $wrapper.html('<div class="empty">Próximamente más tiendas.</div>');
            return;
        }

        window.allStoresData = stores;
        $wrapper.empty();
        stores.forEach(store => {
            const storeDisplay = store.store_name || store.username;
            const logoUrl = store.store_logo || 'https://midominio.com/placeholder-logo.png';

            const $slide = $(`
                <div class="swiper-slide">
                    <div class="store-slide" onclick="openBusinessModal('${store.username}')">
                        <div class="store-logo-circle">
                            ${store.store_logo
                                ? `<img src="${store.store_logo}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`
                                : `<i class="fas fa-store" style="font-size: 3rem; color: var(--primary); display: flex; justify-content: center; align-items: center; height: 100%;"></i>`
                            }
                        </div>
                        <div class="store-name-slide">${storeDisplay}</div>
                        <div style="font-size: 0.8rem; color: #888; margin-top: 5px;">@${store.username}</div>
                    </div>
                </div>
            `);
            $wrapper.append($slide);
        });

        new Swiper('.logos-swiper', {
            slidesPerView: 1,
            spaceBetween: 30,
            loop: true,
            speed: 800,
            grabCursor: true,
            centeredSlides: true,
            autoplay: {
                delay: 2000,
                disableOnInteraction: false,
                pauseOnMouseEnter: true
            },
            pagination: {
                el: '.swiper-pagination',
                clickable: true,
                dynamicBullets: true
            },
            breakpoints: {
                640: {
                    slidesPerView: 2,
                    spaceBetween: 30,
                    centeredSlides: false
                },
                1024: {
                    slidesPerView: 3,
                    spaceBetween: 40,
                    centeredSlides: false
                }
            }
        });
    }

    // --- Business Modal ---
    window.openBusinessModal = function(username) {
        const store = window.allStoresData.find(s => s.username === username);
        if (!store) return;

        const storeDisplay = store.store_name || store.username;
        $('#modal-business-name').text(storeDisplay);
        $('#modal-business-logo').attr('src', store.store_logo || 'https://midominio.com/placeholder-logo.png');

        if (store.ubicacion) {
            $('#modal-business-address').text(store.ubicacion);
            $('#modal-address-container').show();
        } else {
            $('#modal-address-container').hide();
        }

        if (store.horario) {
            $('#modal-business-hours').text(store.horario);
            $('#modal-hours-container').show();
        } else {
            $('#modal-hours-container').hide();
        }

        const publicUrl = `public.html?store=${encodeURIComponent(storeDisplay)}`;
        $('#modal-business-link').attr('href', publicUrl);

        $('#business-modal').addClass('active');
    };

    window.closeBusinessModal = function() {
        $('#business-modal').removeClass('active');
    };

    $('#business-modal').click(function(e) {
        if (e.target === this) closeBusinessModal();
    });

    // --- Cart Logic ---
    function updateCartCount() {
        if (typeof Cart !== 'undefined') {
            $('#cart-count').text(Cart.getCount());
        }
    }

    // --- Hero 3D Card Effect ---
    let targetRX = 0;
    let targetRY = 0;
    let currentRX = 0;
    let currentRY = 0;

    function updateHeroRotation() {
        currentRX += (targetRX - currentRX) * 0.1;
        currentRY += (targetRY - currentRY) * 0.1;

        const $card = $('.card-3d');
        if ($card.length) {
            $card.css('transform', `rotateX(${currentRX}deg) rotateY(${currentRY}deg)`);

            const mx = (currentRY + 20) / 40;
            const my = (currentRX + 20) / 40;
            const angle = (Math.atan2(currentRX, currentRY) * 180 / Math.PI) + 135;

            $card.css({
                '--mx': mx,
                '--my': my,
                '--angle': `${angle}deg`
            });
        }
        requestAnimationFrame(updateHeroRotation);
    }

    const $heroContainer = $('#hero-card');
    $heroContainer.on('mousemove', (e) => {
        const rect = $heroContainer[0].getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        targetRY = ((x / rect.width) - 0.5) * 40;
        targetRX = ((y / rect.height) - 0.5) * -40;
    });

    $heroContainer.on('mouseleave', () => {
        targetRX = 0;
        targetRY = 0;
    });

    // Device orientation for mobile
    if (window.DeviceOrientationEvent) {
        window.addEventListener('deviceorientation', (e) => {
            if (e.gamma !== null && e.beta !== null) {
                targetRY = Math.max(-20, Math.min(20, e.gamma)) * 1.5;
                targetRX = Math.max(-20, Math.min(20, e.beta - 45)) * 1.5;
            }
        });
    }

    updateHeroRotation();

    // --- Hero Card Cycle ---
    const heroCards = [
        "https://tcgplayer-cdn.tcgplayer.com/product/58518_in_1000x1000.jpg",
        "https://tcgplayer-cdn.tcgplayer.com/product/58469_in_1000x1000.jpg",
        "https://tcgplayer-cdn.tcgplayer.com/product/58428_in_1000x1000.jpg",
        "https://tcgplayer-cdn.tcgplayer.com/product/58508_in_1000x1000.jpg",
        "https://tcgplayer-cdn.tcgplayer.com/product/58490_in_1000x1000.jpg",
        "https://tcgplayer-cdn.tcgplayer.com/product/58477_in_1000x1000.jpg"
    ];
    let currentHeroIndex = 0;
    const $heroCard = $('.card-3d');
    const $heroImage = $('#expanded-image');

    if ($heroCard.length && $heroImage.length) {
        setInterval(() => {
            currentHeroIndex = (currentHeroIndex + 1) % heroCards.length;
            const nextSrc = heroCards[currentHeroIndex];

            $heroCard.addClass('fade-out');

            setTimeout(() => {
                const img = new Image();
                img.onload = function() {
                    $heroImage.attr('src', nextSrc);
                    $heroCard.removeClass('fade-out');
                };
                img.src = nextSrc;
            }, 800); // Matches CSS transition duration
        }, 5000);
    }
});
