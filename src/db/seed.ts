/**
 * Development seed for AB Maintenance BD (PostgreSQL).
 *
 * Run with:  npx tsx src/db/seed.ts
 *
 * Creates the permission catalog, the 4 system roles, demo users and
 * realistic sample data. Idempotent — safe to re-run (it skips work that
 * already happened).
 *
 * ⚠️ DEMO LOGINS (all password: Ab123456) — see README for production notes:
 *   superadmin / manager / technician / viewer
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "./index";
import {
  permissions,
  roles,
  rolePermissions,
  users,
  usersRoles,
  units,
  floors,
  machineTypes,
  machines,
  parts,
  stockTransactions,
  employees,
  customMenus,
} from "./schema";
import { ALL_PERMISSIONS, ROLE_TEMPLATES } from "@/lib/permissions";
import bcrypt from "bcryptjs";

async function seed() {
  console.log("Seeding AB Maintenance BD database...");

  const existing = await db.execute(sql`select count(*)::int as total from permissions`);
  const total = Number((existing.rows[0] as { total: number }).total ?? 0);
  if (total > 0) {
    console.log("Permissions already exist — skipping idempotent steps.");
    process.exit(0);
  }

  // 1) Permissions
  const insertedPerms = await db
    .insert(permissions)
    .values(ALL_PERMISSIONS.map((p) => ({ key: p.key, label: p.label, module: p.module, description: p.description ?? null })))
    .returning();
  const permIdByKey = new Map(insertedPerms.map((p) => [p.key, p.id]));

  // 2) Roles + role_permissions
  const insertedRoles = await db
    .insert(roles)
    .values(
      ROLE_TEMPLATES.map((r) => ({
        name: r.name,
        description: r.description,
        isSystem: r.isSystem,
      }))
    )
    .returning();
  for (const role of insertedRoles) {
    const template = ROLE_TEMPLATES.find((r) => r.name === role.name);
    if (!template) continue;
    await db.insert(rolePermissions).values(
      template.permissions.map((key) => ({
        roleId: role.id,
        permissionId: permIdByKey.get(key)!,
      }))
    );
  }

  // 3) Demo users
  const passwordHash = await bcrypt.hash("Ab123456", 12);
  const userRows = [
    { name: "Super Admin", username: "superadmin", role: "Super Admin" },
    { name: "Rahim Uddin", username: "manager", role: "Manager" },
    { name: "Karim Mia", username: "technician", role: "Technician" },
    { name: "Shakil Ahmed", username: "viewer", role: "Viewer" },
  ];
  const roleIdByName = new Map(insertedRoles.map((r) => [r.name, r.id]));
  for (const u of userRows) {
    const [inserted] = await db
      .insert(users)
      .values({ name: u.name, username: u.username, passwordHash, status: "active" })
      .returning();
    await db.insert(usersRoles).values({
      userId: inserted.id,
      roleId: roleIdByName.get(u.role)!,
    });
  }

  // 4) Units
  const [u1, u2, u3, u4] = await db
    .insert(units)
    .values([
      { unitName: "Unit 1", unitCode: "U-01", location: "Gazipur, Dhaka", description: "Main production unit" },
      { unitName: "Unit 2", unitCode: "U-02", location: "Savar, Dhaka", description: "Export processing unit" },
      { unitName: "Unit 3", unitCode: "U-03", location: "Tongi, Gazipur", description: "Finishing unit" },
      { unitName: "Unit 4", unitCode: "U-04", location: "Narayanganj", description: "Packing & dispatch" },
    ])
    .returning();

  // 5) Floors
  const floorDefs: { unitId: number; name: string; number: number }[] = [];
  const u1Floors = ["Ground Floor", "1st Floor", "2nd Floor", "3rd Floor"];
  const u2Floors = ["Ground Floor", "1st Floor", "2nd Floor"];
  const u3Floors = ["Ground Floor", "1st Floor"];
  const u4Floors = ["Ground Floor"];
  for (const [i, name] of u1Floors.entries())
    floorDefs.push({ unitId: u1.id, name, number: i });
  for (const [i, name] of u2Floors.entries())
    floorDefs.push({ unitId: u2.id, name, number: i });
  for (const [i, name] of u3Floors.entries())
    floorDefs.push({ unitId: u3.id, name, number: i });
  for (const [i, name] of u4Floors.entries())
    floorDefs.push({ unitId: u4.id, name, number: i });
  const insertedFloors = await db
    .insert(floors)
    .values(floorDefs.map((f) => ({ unitId: f.unitId, floorName: f.name, floorNumber: f.number })))
    .returning();
  const floorByKey = (unitId: number, number: number) =>
    insertedFloors.find((f) => f.unitId === unitId && f.floorNumber === number)!;

  // 6) Machine types
  const insertedTypes = await db
    .insert(machineTypes)
    .values([
      { name: "Overlock", code: "OVR", description: "Overlock stitching machine" },
      { name: "Filling", code: "FIL", description: "Filling machine" },
      { name: "Mask", code: "MSK", description: "Mask production machine" },
      { name: "Sewing", code: "SEW", description: "Industrial sewing machine" },
      { name: "Cutting", code: "CUT", description: "Fabric cutting machine" },
    ])
    .returning();
  const typeByName = (n: string) => insertedTypes.find((t) => t.name === n)!;

  // 7) Machines
  const machineDefs = [
    { code: "OVR-3F-001", name: "Overlock Machine #1", type: "Overlock", unit: u1, floor: 3, status: "Running", model: "JUKI MO-6714S", serial: "JUKI-OVR-8821", manufacturer: "JUKI Corporation" },
    { code: "OVR-3F-002", name: "Overlock Machine #2", type: "Overlock", unit: u1, floor: 3, status: "Running", model: "JUKI MO-6716S", serial: "JUKI-OVR-8822", manufacturer: "JUKI Corporation" },
    { code: "FIL-3F-001", name: "Filling Machine #1", type: "Filling", unit: u1, floor: 3, status: "Under Maintenance", model: "PFAFF 360", serial: "PFAFF-FIL-4011", manufacturer: "PFAFF" },
    { code: "MSK-3F-001", name: "Mask Machine #1", type: "Mask", unit: u1, floor: 3, status: "Running", model: "AutoMask-2000", serial: "AM-2000-771", manufacturer: "AutoMask Ltd." },
    { code: "SEW-1F-001", name: "Sewing Machine #1", type: "Sewing", unit: u1, floor: 1, status: "Idle", model: "SINGER 4423", serial: "SING-4423-101", manufacturer: "SINGER" },
    { code: "SEW-1F-002", name: "Sewing Machine #2", type: "Sewing", unit: u1, floor: 1, status: "Breakdown", model: "SINGER 4423", serial: "SING-4423-102", manufacturer: "SINGER" },
    { code: "CUT-GF-001", name: "Cutting Machine #1", type: "Cutting", unit: u2, floor: 0, status: "Running", model: "EASTMAN 629", serial: "EAS-629-77", manufacturer: "Eastman" },
    { code: "OVR-2F-001", name: "Overlock Machine #3", type: "Overlock", unit: u2, floor: 2, status: "Running", model: "JUKI MO-6714S", serial: "JUKI-OVR-8890", manufacturer: "JUKI Corporation" },
    { code: "OVR-2F-002", name: "Overlock Machine #4", type: "Overlock", unit: u2, floor: 2, status: "Inactive", model: "JUKI MO-6714S", serial: "JUKI-OVR-8891", manufacturer: "JUKI Corporation" },
    { code: "FIL-1F-001", name: "Filling Machine #2", type: "Filling", unit: u3, floor: 1, status: "Running", model: "PFAFF 360", serial: "PFAFF-FIL-4020", manufacturer: "PFAFF" },
    { code: "MSK-GF-001", name: "Mask Machine #2", type: "Mask", unit: u3, floor: 0, status: "Running", model: "AutoMask-2000", serial: "AM-2000-780", manufacturer: "AutoMask Ltd." },
    { code: "SEW-GF-001", name: "Sewing Machine #3", type: "Sewing", unit: u4, floor: 0, status: "Running", model: "SINGER 4423", serial: "SING-4423-110", manufacturer: "SINGER" },
  ];
  const insertedMachines = await db
    .insert(machines)
    .values(
      machineDefs.map((m) => ({
        machineCode: m.code,
        machineName: m.name,
        machineTypeId: typeByName(m.type).id,
        unitId: m.unit.id,
        floorId: floorByKey(m.unit.id, m.floor).id,
        model: m.model,
        serialNumber: m.serial,
        manufacturer: m.manufacturer,
        installationDate: "2023-06-15",
        status: m.status,
      }))
    )
    .returning();
  void insertedMachines;

  // 8) Parts + opening balances
  const insertedParts = await db
    .insert(parts)
    .values([
      { partCode: "PRT-001", partName: "Afrodul", category: "Thread", unitOfMeasure: "PCS", supplier: "SS Threads Ltd.", countryOfOrigin: "China", minimumStock: "100", openingStock: "500" },
      { partCode: "PRT-002", partName: "Gota Kalappa", category: "Decoration", unitOfMeasure: "PCS", supplier: "Deco Trade", countryOfOrigin: "India", minimumStock: "50", openingStock: "200" },
      { partCode: "PRT-003", partName: "Fusing Interlining", category: "Interlining", unitOfMeasure: "Meter", supplier: "Texbond Co.", countryOfOrigin: "South Korea", minimumStock: "300", openingStock: "1200" },
      { partCode: "PRT-004", partName: "Needle DBx1", category: "Needles", unitOfMeasure: "PCS", supplier: "Organ Needle", countryOfOrigin: "Japan", minimumStock: "200", openingStock: "150" },
      { partCode: "PRT-005", partName: "Sewing Oil (5L)", category: "Lubricant", unitOfMeasure: "Liter", supplier: "LubeX Bangladesh", countryOfOrigin: "Bangladesh", minimumStock: "50", openingStock: "30" },
      { partCode: "PRT-006", partName: "Timing Belt", category: "Spare Parts", unitOfMeasure: "PCS", supplier: "Machine Parts BD", countryOfOrigin: "Taiwan", minimumStock: "20", openingStock: "0" },
    ])
    .returning();
  const partByCode = (c: string) => insertedParts.find((p) => p.partCode === c)!;

  // 9) Stock ledger — opening entries + IN/OUT history
  const adminUser = await db.execute(
    sql`select id from users where username = 'superadmin'`
  );
  const adminId = Number((adminUser.rows[0] as { id: number }).id);

  const openingRows = insertedParts
    .filter((p) => Number(p.openingStock) > 0)
    .map((p) => ({
      partId: p.id,
      transactionType: "OPENING",
      quantity: p.openingStock,
      transactionDate: "2024-01-01",
      note: "Opening balance",
      createdBy: adminId,
    }));

  const ledgerRows = [
    // Afrodul: 500 opening, -20 OUT, +100 IN, -30 OUT => 550 current
    { code: "PRT-001", type: "OUT", qty: "20", date: "2024-02-10", destination: "Unit 1 — 3rd Floor", machine: "OVR-3F-001", purpose: "Production", ref: "OUT-1001" },
    { code: "PRT-001", type: "IN", qty: "100", date: "2024-03-02", source: "Bangladesh", supplier: "SS Threads Ltd.", ref: "INV-2201" },
    { code: "PRT-001", type: "OUT", qty: "30", date: "2024-03-18", destination: "Unit 2 — 2nd Floor", purpose: "Production", ref: "OUT-1044" },
    // Gota Kalappa: 200 opening, -40 OUT => 160
    { code: "PRT-002", type: "OUT", qty: "40", date: "2024-03-05", destination: "Unit 1 — 1st Floor", purpose: "Decoration", ref: "OUT-1019" },
    // Fusing: 1200 opening, -250 OUT => 950
    { code: "PRT-003", type: "OUT", qty: "250", date: "2024-02-22", destination: "Unit 2 — Ground Floor", purpose: "Production", ref: "OUT-1022" },
    // Needle: 150 opening, -90 OUT => 60 (LOW: min 200)
    { code: "PRT-004", type: "OUT", qty: "90", date: "2024-03-12", destination: "Unit 1 — 3rd Floor", purpose: "Replacement", ref: "OUT-1033" },
    // Oil: 30 opening, -18 OUT => 12 (LOW: min 50)
    { code: "PRT-005", type: "OUT", qty: "18", date: "2024-03-20", destination: "Unit 3 — 1st Floor", purpose: "Machine maintenance", ref: "OUT-1050" },
  ];

  const machineByCode = new Map(
    (await db.execute(sql`select id, machine_code from machines`)).rows.map((r) => [
      (r as { machine_code: string }).machine_code,
      (r as { id: number }).id,
    ])
  );

  await db.insert(stockTransactions).values([
    ...openingRows,
    ...ledgerRows.map((r) => ({
      partId: partByCode(r.code).id,
      transactionType: r.type as "IN" | "OUT",
      quantity: r.qty,
      transactionDate: r.date,
      source: r.source ?? null,
      destination: r.destination ?? null,
      supplier: r.supplier ?? null,
      machineId: r.machine ? (machineByCode.get(r.machine) ?? null) : null,
      purpose: r.purpose ?? null,
      referenceNumber: r.ref ?? null,
      createdBy: adminId,
    })),
  ]);

  // 10) Employees
  await db.insert(employees).values([
    { employeeCode: "EMP-001", name: "Md. Rafiq Islam", phone: "01711-000001", designation: "Floor Supervisor", department: "Production", joiningDate: "2019-03-01", currentSalary: "28000", lastIncrementDate: "2023-07-01", status: "active" },
    { employeeCode: "EMP-002", name: "Sultana Begum", phone: "01711-000002", designation: "Quality Inspector", department: "Quality", joiningDate: "2020-05-15", currentSalary: "22000", lastIncrementDate: "2023-07-01", status: "active" },
    { employeeCode: "EMP-003", name: "Jasim Uddin", phone: "01711-000003", designation: "Machine Operator", department: "Production", joiningDate: "2021-01-10", currentSalary: "16500", lastIncrementDate: "2023-07-01", status: "active" },
    { employeeCode: "EMP-004", name: "Nusrat Jahan", phone: "01711-000004", designation: "Store Keeper", department: "Stores", joiningDate: "2018-11-20", currentSalary: "24000", lastIncrementDate: "2023-01-01", status: "active" },
    { employeeCode: "EMP-005", name: "Alam Hossain", phone: "01711-000005", designation: "Maintenance Technician", department: "Maintenance", joiningDate: "2017-06-01", currentSalary: "26000", lastIncrementDate: "2024-01-01", status: "active" },
    { employeeCode: "EMP-006", name: "Rina Akter", phone: "01711-000006", designation: "Helper", department: "Production", joiningDate: "2022-02-01", currentSalary: "12000", lastIncrementDate: "2023-07-01", status: "inactive" },
  ]);

  // 11) Default workbook menus — each record is opened as its own spreadsheet-style sheet.
  await db.insert(customMenus).values([
    {
      name: "Employees Workbook",
      slug: "employees-workbook",
      entityType: "employee",
      icon: "👷",
      description: "One spreadsheet-style workbook for every employee.",
      columns: JSON.stringify([
        { key: "phone", label: "Phone", type: "text" },
        { key: "designation", label: "Designation", type: "text" },
        { key: "department", label: "Department", type: "text" },
        { key: "joining_date", label: "Joining date", type: "date" },
        { key: "current_salary", label: "Salary", type: "number" },
      ]),
      sortOrder: 10,
      createdBy: adminId,
    },
    {
      name: "Products Workbook",
      slug: "products-workbook",
      entityType: "part",
      icon: "🧩",
      description: "One product workbook with a live inventory ledger.",
      columns: JSON.stringify([
        { key: "category", label: "Category", type: "text" },
        { key: "supplier", label: "Supplier", type: "text" },
        { key: "minimum_stock", label: "Minimum stock", type: "number" },
      ]),
      sortOrder: 20,
      createdBy: adminId,
    },
  ]).onConflictDoNothing();

  console.log("✅ Seed complete.");
  console.log("   Demo logins (password: Ab123456): superadmin, manager, technician, viewer");
  process.exit(0);
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
