const VikingData = {
    async search(query) {
        try {
            const { data: dbResults } = await _supabase
                .from('viking_data')
                .select('*')
                .ilike('name', `%${query}%`);

            let jsonResults = [];
            try {
                const resp = await fetch('vikingData.json');
                if (resp.ok) {
                    const allJson = await resp.json();
                    jsonResults = allJson.filter(item => item.name && item.name.toLowerCase().includes(query.toLowerCase()));
                }
            } catch (e) {
                console.warn("Error fetching vikingData.json", e);
            }

            const combined = [...(dbResults || []), ...jsonResults];
            return combined.map(item => ({
                name: item.name,
                image: item.image_url,
                high_res: item.image_url,
                tcg: item.tcg || 'custom',
                expansion: item.expansion || '',
                rarity: item.rarity || '',
                price: item.price || '',
                source: 'viking'
            }));
        } catch (err) {
            console.error("VikingData Search Error:", err);
            return [];
        }
    },

    async save(itemData) {
        const entry = {
            name: itemData.name,
            image_url: itemData.image_url,
            expansion: itemData.expansion || '',
            rarity: itemData.rarity || '',
            tcg: itemData.tcg || 'custom',
            price: itemData.price || '',
            type: itemData.type || 'card',
            user_id: itemData.user_id
        };
        const { error } = await _supabase.from('viking_data').insert([entry]);
        if (error) console.warn("Error saving to viking_data:", error);
        return !error;
    }
};
