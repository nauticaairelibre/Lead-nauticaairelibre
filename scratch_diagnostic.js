fetch('https://docs.google.com/spreadsheets/d/1eYVpy1qEdCy91aqyV77jTkqFbYPOT4ubSouZokIXLSk/gviz/tq?tqx=out:csv&gid=0')
  .then(res => res.text())
  .then(csv => {
    // Simple manual CSV parser that mimics PapaParse output
    const lines = csv.split('\n').map(line => {
      // Split by comma outside of quotes (simple version)
      const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
      return matches.map(m => m.replace(/^"|"$/g, ''));
    }).filter(l => l.length > 0);

    const headers = lines[0] || [];
    const allData = [];

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i];
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = row[idx] || '';
      });
      allData.push(obj);
    }

    function norm(s) {
      return (s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    function col(row, ...keys) {
      for (const k of keys) {
        const found = Object.keys(row).find(rk => norm(rk) === norm(k));
        if (found !== undefined && row[found] !== undefined) return row[found];
      }
      return '';
    }

    function getLeadKey(row) {
      const tel = col(row, 'telefono', 'teléfono', 'Telefono', 'Teléfono').trim();
      const name = col(row, 'nombre', 'Nombre').trim();
      return tel || name || Math.random().toString();
    }

    console.log('--- DIAGNOSTIC RESULTS ---');
    console.log('Total Leads parsed:', allData.length);
    console.log('Headers found:', headers);

    for (let i = 0; i < Math.min(5, allData.length); i++) {
      const row = allData[i];
      const key = getLeadKey(row);
      console.log(`\nLead #${i + 1} (Excel Row ${i + 2}):`);
      console.log(`  Nombre: "${col(row, 'nombre', 'Nombre')}"`);
      console.log(`  Teléfono: "${col(row, 'telefono', 'teléfono', 'Telefono', 'Teléfono')}"`);
      console.log(`  getLeadKey: "${key}"`);
    }
  })
  .catch(err => {
    console.error('Fetch error:', err);
  });
