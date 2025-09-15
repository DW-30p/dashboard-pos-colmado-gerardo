import { Pool } from 'pg';

// Configuración de la conexión a PostgreSQL (Neon)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const client = await pool.connect();

  try {
    // Test básico de conexión
    const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
    
    // Verificar que las tablas principales existen
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;
    
    const tablesResult = await client.query(tablesQuery);
    
    // Contar registros en tablas principales
    const countsQuery = `
      SELECT 
        (SELECT COUNT(*) FROM users) as users_count,
        (SELECT COUNT(*) FROM products) as products_count,
        (SELECT COUNT(*) FROM customers) as customers_count,
        (SELECT COUNT(*) FROM sales) as sales_count,
        (SELECT COUNT(*) FROM categories) as categories_count
    `;
    
    const countsResult = await client.query(countsQuery);
    
    // Verificar configuración de la tienda
    const storeConfigQuery = `
      SELECT name, rnc, tax_rate, tax_enabled 
      FROM store_config 
      WHERE id = 1
    `;
    
    const storeConfigResult = await client.query(storeConfigQuery);
    
    // Verificar balance de caja
    const cashRegisterQuery = `
      SELECT current_balance, last_updated 
      FROM cash_register 
      WHERE id = 1
    `;
    
    const cashRegisterResult = await client.query(cashRegisterQuery);

    res.status(200).json({
      success: true,
      message: 'Conexión a base de datos exitosa',
      data: {
        connection_info: {
          current_time: result.rows[0].current_time,
          postgresql_version: result.rows[0].pg_version,
          database_url_configured: !!process.env.DATABASE_URL
        },
        tables: tablesResult.rows.map(row => row.table_name),
        record_counts: countsResult.rows[0],
        store_config: storeConfigResult.rows[0] || null,
        cash_register: cashRegisterResult.rows[0] || null
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error en test-connection:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error de conexión a la base de datos',
      message: error.message,
      details: {
        database_url_configured: !!process.env.DATABASE_URL,
        error_code: error.code,
        error_detail: error.detail
      }
    });
  } finally {
    client.release();
  }
}