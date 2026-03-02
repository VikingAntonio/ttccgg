let isScanning = false;
let stream = null;

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

let currentUser = null;
let tesseractWorker = null;
let scanTimer = null;

$(document).ready(async function() {
    checkSession();
    await loadInitialData();
    await initTesseract();

    $('#select-target-type').change(function() {
        const type = $(this).val();
        $('#dest-label').text(type === 'album' ? 'Seleccionar Álbum' : 'Seleccionar Deck');
        loadDestinations(type);
    });

    $('#btn-new-dest').click(createNewDestination);

    $('#btn-toggle-scan').click(async function() {
        if (!isScanning) {
            await startCamera();
        } else {
            stopCamera();
        }
    });

    $('#btn-upload').click(function() {
        $('#file-upload').click();
    });

    $('#file-upload').change(handleFileUpload);

    $('#btn-manual').click(async function() {
        const { value: code } = await Swal.fire({
            title: 'Entrada Manual',
            input: 'text',
            inputLabel: 'Introduce el código de la carta',
            inputPlaceholder: 'LOB-001 / 58/102',
            showCancelButton: true,
            confirmButtonColor: '#00d2ff',
            background: '#1a1a2e',
            color: '#fff'
        });

        if (code) {
            await handleFoundCode(code.toUpperCase().trim());
        }
    });
});

function checkSession() {
    const session = localStorage.getItem('tcg_session');
    if (session) {
        currentUser = JSON.parse(session);
        // Show development warning for everyone except admin
        if (currentUser.role !== 'admin') {
            $('#dev-warning').show();
        }
    } else {
        window.location.href = 'admin.html';
    }
}

async function loadInitialData() {
    await loadDestinations('album');
}

async function loadDestinations(type) {
    const table = type === 'album' ? 'albums' : 'decks';
    const { data, error } = await _supabase
        .from(table)
        .select('*')
        .eq('user_id', currentUser.id)
        .order('id', { ascending: true });

    const $select = $('#select-dest');
    $select.empty();
    if (data && data.length > 0) {
        data.forEach(item => {
            $select.append(`<option value="${item.id}">${item.title || item.name}</option>`);
        });
    } else {
        $select.append(`<option value="">No hay ${type}s</option>`);
    }
}

async function createNewDestination() {
    const type = $('#select-target-type').val();

    // Check limit
    const table = type === 'album' ? 'albums' : 'decks';
    const limit = type === 'album' ? (currentUser.max_albums || 3) : (currentUser.max_decks || 1);
    const { count } = await _supabase.from(table).select('*', { count: 'exact', head: true }).eq('user_id', currentUser.id);

    if (count >= limit) {
        Swal.fire('Límite alcanzado', `Tu plan actual permite un máximo de ${limit} ${type === 'album' ? 'álbumes' : 'deck'}.`, 'warning');
        return;
    }

    const { value: name } = await Swal.fire({
        title: `Nuevo ${type === 'album' ? 'Álbum' : 'Deck'}`,
        input: 'text',
        inputLabel: `Nombre del ${type}`,
        showCancelButton: true,
        confirmButtonColor: '#00d2ff',
        background: '#1a1a2e',
        color: '#fff'
    });

    if (name) {
        const table = type === 'album' ? 'albums' : 'decks';
        const field = type === 'album' ? 'title' : 'name';
        const { data, error } = await _supabase
            .from(table)
            .insert([{ [field]: name, user_id: currentUser.id }])
            .select();

        if (!error) {
            await loadDestinations(type);
            $('#select-dest').val(data[0].id);
        }
    }
}

async function initTesseract() {
    if (tesseractWorker) return;
    $('#status-text').text('Iniciando OCR...');
    tesseractWorker = await Tesseract.createWorker('eng');
    await tesseractWorker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/- '
    });
    $('#status-text').text('Motor Listo');
    $('#status-container').addClass('status-ready');
}

async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
        });
        const video = document.getElementById('video-preview');
        video.srcObject = stream;
        video.style.display = 'block';
        $('#file-preview').hide();

        isScanning = true;
        $('#btn-toggle-scan').html('<i class="fas fa-stop"></i> Detener').removeClass('btn-primary').addClass('btn-secondary');
        $('#scanner-viewport').addClass('scanner-active');
        $('#status-text').text('Escaneando...');

        startScanningLoop();
    } catch (err) {
        console.error("Error accessing camera:", err);
        Swal.fire('Error', 'No se pudo acceder a la cámara.', 'error');
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        document.getElementById('video-preview').srcObject = null;
    }
    isScanning = false;
    clearTimeout(scanTimer);
    $('#btn-toggle-scan').html('<i class="fas fa-camera"></i> Cámara').removeClass('btn-secondary').addClass('btn-primary');
    $('#scanner-viewport').removeClass('scanner-active');
    $('#status-text').text('Pausado');
    $('#status-container').removeClass('status-working');
}

async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    stopCamera();

    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = async function() {
            $('#file-preview').attr('src', event.target.result).show();
            $('#video-preview').hide();
            $('#status-text').text('Procesando Imagen...');
            $('#status-container').addClass('status-working');

            await processImage(img);
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function startScanningLoop() {
    if (!isScanning) return;

    scanTimer = setTimeout(async () => {
        if (!isScanning) return;

        const video = document.getElementById('video-preview');
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            await captureAndProcessFrame(video);
        }

        startScanningLoop();
    }, 1200);
}

async function captureAndProcessFrame(video) {
    const canvas = document.getElementById('hidden-canvas');
    const ctx = canvas.getContext('2d');

    const vW = video.videoWidth;
    const vH = video.videoHeight;

    let cropW, cropH, cropX, cropY;

    if (vW > vH) {
        cropH = vH * 0.85;
        cropW = vH * 0.75;
        cropX = (vW - vH) / 2 + (vH * 0.125);
        cropY = vH * 0.075;
    } else {
        cropW = vW * 0.75;
        cropH = vW * 0.85;
        cropX = vW * 0.125;
        cropY = (vH - vW) / 2 + vW * 0.075;
    }

    canvas.width = 800;
    canvas.height = 1100;

    ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);

    preprocessCanvas(canvas);

    $('#status-text').text('Identificando...');
    $('#status-container').addClass('status-working');

    await processImage(canvas);
}

function preprocessCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const threshold = 128;
        const v = avg > threshold ? 255 : 0;
        data[i] = data[i+1] = data[i+2] = v;
    }
    ctx.putImageData(imageData, 0, 0);
}

async function processImage(imageOrCanvas) {
    try {
        const { data: { text } } = await tesseractWorker.recognize(imageOrCanvas);
        await processDetectedText(text);
    } catch (err) {
        console.error("OCR Error:", err);
        $('#status-text').text('Error en OCR');
        $('#status-container').removeClass('status-working');
    }
}

function smartNormalize(s) {
    // Only normalize if it looks like it should be mostly numeric
    const digitCount = (s.match(/[0-9]/g) || []).length;
    const letterCount = (s.match(/[A-Z]/g) || []).length;

    if (digitCount >= letterCount) {
        return s.replace(/O|Q/g, '0')
                .replace(/I|L|T/g, '1')
                .replace(/Z/g, '2')
                .replace(/E/g, '3')
                .replace(/A/g, '4')
                .replace(/S/g, '5')
                .replace(/G/g, '6')
                .replace(/B/g, '8')
                .replace(/\s/g, '');
    }
    return s.replace(/\s/g, '');
}

function identifyFromText(text) {
    const lines = text.toUpperCase().split('\n');
    let results = [];

    for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        // 1. Yu-Gi-Oh: [SET]-[LANG][ID]
        // Allow broad alphanumeric for prefix and suffix
        const regexYG = /\b([A-Z0-9]{3,6})[\-\s]([A-Z0-9]{3,8})\b/i;
        const matchYG = line.match(regexYG);
        if (matchYG) {
            let prefix = matchYG[1];
            let suffix = matchYG[2];

            // For Yu-Gi-Oh suffix, language is usually 2 letters
            let lang = "";
            let idPart = suffix;
            if (/^[A-Z]{2}[A-Z0-9]{1,}/.test(suffix)) {
                lang = suffix.substring(0, 2);
                idPart = suffix.substring(2);
            }

            let normalizedID = smartNormalize(idPart);
            results.push({ code: prefix + '-' + lang + normalizedID, type: 'yugioh' });
        }

        // 2. Pokémon Fraction
        const regexPK_F = /\b([A-Z0-9]{1,5})\/([A-Z0-9]{1,5})\b/i;
        const matchPK_F = line.match(regexPK_F);
        if (matchPK_F) {
            let n1 = smartNormalize(matchPK_F[1]);
            let n2 = smartNormalize(matchPK_F[2]);
            results.push({ code: n1 + '/' + n2, type: 'pokemon' });
        }

        // 3. Pokémon Promo
        const regexPK_P = /\b([A-Z]{2,5})[\s]?([0-9OILS BZGEA]{2,5})\b/i;
        const matchPK_P = line.match(regexPK_P);
        if (matchPK_P) {
            let prefix = matchPK_P[1];
            if (!['BASIC', 'STAGE', 'HP', 'NO', 'DNA'].includes(prefix)) {
                let num = smartNormalize(matchPK_P[2]);
                results.push({ code: prefix + num, type: 'pokemon' });
            }
        }
    }

    return results.length > 0 ? results[0] : { code: null, type: null };
}

async function processDetectedText(text) {
    const { code, type } = identifyFromText(text);

    if (code) {
        $('#detected-code').text(code);
        const success = await handleFoundCode(code, type);
        if (!success && code) {
             showManualPrompt(code, text);
        }
    } else {
        const raw = text.trim().replace(/[\n\r]/g, ' ').substring(0, 40);
        if (raw.length > 5) {
            $('#detected-code').html(`<span style="opacity: 0.5; font-size: 0.8rem;">? ${raw}</span> <i class="fas fa-edit" style="cursor:pointer; margin-left: 5px;" onclick="promptCorrection('${raw.replace(/'/g, "\\'")}')"></i>`);
            if ($('#file-preview').is(':visible')) {
                showManualPrompt(null, text);
            }
        }

        $('#status-text').text(isScanning ? 'Escaneando...' : 'Listo');
        $('#status-container').removeClass('status-working');
    }
}

async function showManualPrompt(failedCode, rawText) {
    if (window.isPrompting) return;
    window.isPrompting = true;

    const title = failedCode ? `No se encontró ${failedCode}` : 'Código no detectado';
    const msg = failedCode ? 'El código parece correcto pero no está en la base de datos. ¿Deseas corregirlo?' : 'No pudimos encontrar un código. ¿Deseas ingresarlo manualmente?';

    const { isConfirmed } = await Swal.fire({
        title: title,
        text: msg,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, editar',
        cancelButtonText: 'No'
    });

    window.isPrompting = false;
    if (isConfirmed) {
        promptCorrection(failedCode || rawText.substring(0, 20));
    }
}

async function promptCorrection(detectedText) {
    const { value: correctedCode } = await Swal.fire({
        title: 'Corregir Código',
        input: 'text',
        inputValue: detectedText,
        inputLabel: 'Introduce el código correcto:',
        showCancelButton: true,
        confirmButtonColor: '#00d2ff',
        background: '#1a1a2e',
        color: '#fff'
    });

    if (correctedCode) {
        await handleFoundCode(correctedCode.toUpperCase().trim());
    }
}

async function handleFoundCode(code, type = null) {
    if (window.lastProcessedCode === code) return true;
    window.lastProcessedCode = code;

    $('#status-text').text('Buscando...');

    if (!type) {
        if (code.includes('-')) type = 'yugioh';
        else if (code.includes('/') || /^[A-Z]{2,}\d+/.test(code)) type = 'pokemon';
        else type = 'pokemon';
    }

    const cardData = await fetchCardData(code, type);

    if (cardData) {
        const saved = await saveCard(cardData);
        if (saved) {
            showToast('success', 'Carta Añadida', cardData.name, cardData.image_url);
            setTimeout(() => { window.lastProcessedCode = null; }, 4000);
            return true;
        }
    }

    setTimeout(() => { window.lastProcessedCode = null; }, 2000);
    return false;
}

async function fetchCardData(code, type) {
    try {
        if (type === 'yugioh') {
            const cleanCode = code.toUpperCase().replace(/\s/g, '-').replace(/-{2,}/g, '-');
            let data = null;

            // 1. Try search by Passcode (Numeric 5-10 digits)
            if (/^\d{5,10}$/.test(cleanCode)) {
                const res = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${cleanCode}`);
                data = await res.json();
            }
            // 2. Try search by Set Code resolution
            else {
                const setMatch = cleanCode.match(/^([A-Z0-9]{3,6})-([A-Z0-9]{3,8})$/);
                if (setMatch) {
                    const prefix = setMatch[1];
                    const sets = await getYgoSets();
                    const setObj = sets.find(s => s.set_code.toUpperCase() === prefix);
                    if (setObj) {
                        const res = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?cardset=${encodeURIComponent(setObj.set_name)}`);
                        const fullSetData = await res.json();
                        if (fullSetData.data) {
                            // Filter for the exact card in the set
                            const cardMatch = fullSetData.data.find(c => c.card_sets && c.card_sets.some(s => s.set_code.toUpperCase() === cleanCode));
                            if (cardMatch) {
                                data = { data: [cardMatch] };
                            }
                        }
                    }
                }
            }

            // 3. Fallback: Try search by name (legacy/simple)
            if (!data || !data.data) {
                const res = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?cardset=${encodeURIComponent(cleanCode)}`);
                data = await res.json();
            }

            if (data && data.data && data.data.length > 0) {
                const card = data.data[0];
                const setInfo = card.card_sets?.find(s => s.set_code.toUpperCase() === cleanCode) || card.card_sets?.[0];

                // For scanner, we prefer the first image or try to find a matching one if possible
                // (YGOPRODeck doesn't easily map set_code to card_image index, so we use the first)
                return {
                    name: card.name,
                    image_url: card.card_images[0].image_url,
                    rarity: setInfo?.set_rarity || '',
                    expansion: setInfo?.set_name || '',
                    type: 'yugioh'
                };
            }
        } else {
            let number, total;
            if (code.includes('/')) {
                [number, total] = code.split('/');
                const query = `number:${number} set.printedTotal:${total}`;
                const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(query)}`);
                const data = await res.json();
                if (data.data && data.data.length > 0) return formatPokemonCard(data.data[0]);
            }

            number = code.includes('/') ? code.split('/')[0] : code;
            const resNum = await fetch(`https://api.pokemontcg.io/v2/cards?q=number:${number}`);
            const dataNum = await resNum.json();
            if (dataNum.data && dataNum.data.length > 0) {
                if (code.includes('/')) {
                    const bestMatch = dataNum.data.find(c => c.set.printedTotal == code.split('/')[1]) || dataNum.data[0];
                    return formatPokemonCard(bestMatch);
                }
                return formatPokemonCard(dataNum.data[0]);
            }

            // TCGdex Multilingual Fallback (English -> Spanish -> Japanese)
            const langs = ['en', 'es', 'ja'];
            for (const lang of langs) {
                try {
                    const resFb = await fetch(`https://api.tcgdex.net/v2/${lang}/cards/${code.toLowerCase()}`);
                    if (resFb.ok) {
                        const card = await resFb.json();
                        return {
                            name: card.name,
                            image_url: `${card.image}/high.webp`,
                            rarity: card.rarity || '',
                            expansion: card.set.name || '',
                            type: 'pokemon'
                        };
                    }
                } catch (e) {
                    console.warn(`TCGdex search failed for ${lang}:`, e);
                }
            }
        }
    } catch (err) {
        console.error("Fetch Error:", err);
    }
    return null;
}

function formatPokemonCard(card) {
    return {
        name: card.name,
        image_url: card.images.large,
        rarity: card.rarity || '',
        expansion: card.set.name || '',
        type: 'pokemon'
    };
}

async function saveCard(cardData) {
    const targetType = $('#select-target-type').val();
    const destId = $('#select-dest').val();

    if (!destId) return false;

    try {
        if (targetType === 'album') {
            let { data: pages } = await _supabase.from('pages').select('id, page_index').eq('album_id', destId).order('page_index', { ascending: true });
            if (!pages || pages.length === 0) {
                const { data: newPage } = await _supabase.from('pages').insert([{ album_id: destId, page_index: 0 }]).select();
                pages = newPage;
            }

            const { data: allSlots } = await _supabase.from('card_slots').select('page_id, slot_index').in('page_id', pages.map(p => p.id));
            let saved = false;
            for (const page of pages) {
                const occupied = (allSlots || []).filter(s => s.page_id === page.id).map(s => s.slot_index);
                for (let i = 0; i < 9; i++) {
                    if (!occupied.includes(i)) {
                        await _supabase.from('card_slots').insert([{
                            page_id: page.id, slot_index: i, name: cardData.name, image_url: cardData.image_url,
                            rarity: cardData.rarity, expansion: cardData.expansion, condition: 'M', quantity: 1
                        }]);
                        saved = true; break;
                    }
                }
                if (saved) break;
            }

            if (!saved) {
                // Check page limit
                if (pages.length >= (currentUser.max_pages || 5)) {
                    Swal.fire('Límite alcanzado', `Has alcanzado el límite de ${currentUser.max_pages || 5} páginas en este álbum.`, 'warning');
                    return false;
                }

                const lastIdx = pages[pages.length - 1].page_index;
                const { data: nPage } = await _supabase.from('pages').insert([{ album_id: destId, page_index: lastIdx + 1 }]).select();
                await _supabase.from('card_slots').insert([{
                    page_id: nPage[0].id, slot_index: 0, name: cardData.name, image_url: cardData.image_url,
                    rarity: cardData.rarity, expansion: cardData.expansion, condition: 'M', quantity: 1
                }]);
            }
            return true;
        } else {
            // Check deck card limit
            const { count } = await _supabase.from('deck_cards').select('*', { count: 'exact', head: true }).eq('deck_id', destId);
            if (count >= (currentUser.max_cards_per_deck || 60)) {
                Swal.fire('Límite alcanzado', `Este deck ya tiene el máximo de ${currentUser.max_cards_per_deck || 60} cartas permitidas.`, 'warning');
                return false;
            }

            await _supabase.from('deck_cards').insert([{
                deck_id: destId, name: cardData.name, image_url: cardData.image_url,
                rarity: cardData.rarity, expansion: cardData.expansion, quantity: 1
            }]);
            return true;
        }
    } catch (err) {
        console.error("Save Error:", err);
        return false;
    }
}

function showToast(type, title, message, imageUrl = null) {
    const $toast = $('#result-toast');
    $toast.removeClass('success error active');
    $('#toast-title').text(title);
    $('#toast-name').text(message);

    if (imageUrl) {
        $('#toast-img').attr('src', imageUrl).show();
        $('#toast-icon-err').hide();
    } else {
        $('#toast-img').hide();
        $('#toast-icon-err').css('display', 'flex');
    }

    $toast.addClass(type).addClass('active');
    setTimeout(() => $toast.removeClass('active'), 3000);
}
