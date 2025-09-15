import { Pool } from 'pg';

// Configuración de la conexión a PostgreSQL (Neon)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

export default async function handler(req, res) {
  // Solo permitir métodos GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const client = await pool.connect();

  try {
    // 1. Ingresos del período (este mes) y cantidad de ventas
    const periodIncomeQuery = await client.query(`
      SELECT 
        COALESCE(SUM(total), 0) as income, 
        COUNT(*) as sales_count
      FROM sales 
      WHERE date >= date_trunc('month', CURRENT_DATE)
    `);

    // 2. Ventas semanales
    const weeklySalesQuery = await client.query(`
      SELECT COALESCE(SUM(total), 0) as weekly_sales
      FROM sales 
      WHERE date >= date_trunc('week', CURRENT_DATE)
    `);

    // 3. Ventas mensuales
    const monthlySalesQuery = await client.query(`
      SELECT COALESCE(SUM(total), 0) as monthly_sales
      FROM sales 
      WHERE date >= date_trunc('month', CURRENT_DATE)
    `);

    // 4. Balance de caja actual
    const cashBalanceQuery = await client.query(`
      SELECT current_balance 
      FROM cash_register 
      WHERE id = 1
    `);

    // 5. Total de clientes registrados
    const customersQuery = await client.query(`
      SELECT COUNT(*) as total_customers 
      FROM customers
    `);

    // 6. Valor del inventario y productos con stock bajo
    const inventoryQuery = await client.query(`
      SELECT 
        COALESCE(SUM(price * stock), 0) as inventory_value,
        COUNT(CASE WHEN stock <= min_stock AND available = true THEN 1 END) as low_stock_count
      FROM products 
      WHERE available = true
    `);

    // 7. Ventas de la semana anterior para comparación
    const previousWeekQuery = await client.query(`
      SELECT COALESCE(SUM(total), 0) as previous_week_sales
      FROM sales 
      WHERE date >= date_trunc('week', CURRENT_DATE) - INTERVAL '1 week'
        AND date < date_trunc('week', CURRENT_DATE)
    `);

    // 8. Ventas del mes anterior para comparación
    const previousMonthQuery = await client.query(`
      SELECT COALESCE(SUM(total), 0) as previous_month_sales
      FROM sales 
      WHERE date >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
        AND date < date_trunc('month', CURRENT_DATE)
    `);

    // Procesar resultados
    const periodIncome = parseFloat(periodIncomeQuery.rows[0].income);
    const salesCount = parseInt(periodIncomeQuery.rows[0].sales_count);
    const weeklySales = parseFloat(weeklySalesQuery.rows[0].weekly_sales);
    const monthlySales = parseFloat(monthlySalesQuery.rows[0].monthly_sales);
    const cashBalance = parseFloat(cashBalanceQuery.rows[0]?.current_balance || 0);
    const totalCustomers = parseInt(customersQuery.rows[0].total_customers);
    const inventoryValue = parseFloat(inventoryQuery.rows[0].inventory_value);
    const lowStockCount = parseInt(inventoryQuery.rows[0].low_stock_count);
    const previousWeekSales = parseFloat(previousWeekQuery.rows[0].previous_week_sales);
    const previousMonthSales = parseFloat(previousMonthQuery.rows[0].previous_month_sales);

    // Calcular porcentajes de crecimiento
    const weeklyGrowth = previousWeekSales > 0 
      ? ((weeklySales - previousWeekSales) / previousWeekSales * 100).toFixed(1)
      : 0;

    const monthlyGrowth = previousMonthSales > 0 
      ? ((monthlySales - previousMonthSales) / previousMonthSales * 100).toFixed(1)
      : 0;

    // Calcular promedio por venta
    const avgSale = salesCount > 0 ? periodIncome / salesCount : 0;

    // Respuesta con todas las estadísticas
    const stats = {
      periodIncome: periodIncome,
      weeklySales: weeklySales,
      monthlySales: monthlySales,
      cashBalance: cashBalance,
      totalSales: salesCount,
      avgSale: avgSale,
      inventoryValue: inventoryValue,
      totalCustomers: totalCustomers,
      lowStockCount: lowStockCount,
      weeklyGrowth: weeklyGrowth,
      monthlyGrowth: monthlyGrowth,
      // Datos adicionales
      previousWeekSales: previousWeekSales,
      previousMonthSales: previousMonthSales
    };

    res.status(200).json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error en dashboard-stats:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error interno del servidor',
      message: error.message 
    });
  } finally {
    client.release();
  }
}