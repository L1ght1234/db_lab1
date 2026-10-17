import { pool } from './db.js';
import { UnitOfWork } from './unitOfWork.js';

const ADMIN_ID = 1;     // Олександр Коваленко
const ORGANIZER_ID = 2; // Ірина Мельник
const FAN_ID = 6;       // Дмитро Петренко

function printTitle(text: string): void {
  console.log(`\n=== ${text} ===`);
}

// 1. Робота з кількома пов'язаними сутностями в одній транзакції
async function scenario1CreateCupMatchAndTickets(): Promise<{ teamId: number; matchId: number }> {
  printTitle('1. Створення команди, турніру, матчу і продаж квитків (одна транзакція)');

  return UnitOfWork.run(ORGANIZER_ID, async (uow) => {
    const teamId = await uow.teams.create(1, 'Кривбас Кривий Ріг', 'Кривий Ріг', 1959);

    const { tournamentId, stageId } = await uow.tournaments.create(
      1,
      'Кубок України',
      '2026/2027',
      '2026-10-01',
      '2027-05-15',
      'Чвертьфінал'
    );

    await uow.tournaments.registerTeam(tournamentId, 1, 1);      // Динамо Київ
    await uow.tournaments.registerTeam(tournamentId, teamId, 2); // Кривбас

    const matchId = await uow.matches.schedule(
      stageId,
      1, // НСК Олімпійський
      1,
      teamId,
      '2026-11-20T19:00:00+02:00'
    );

    await uow.tickets.sell(matchId, 2, FAN_ID, 'VIP-10');
    await uow.tickets.sell(matchId, 1, FAN_ID, 'C-15');

    // Фіксуємо всі зміни однією транзакцією
    await uow.commit();

    const tour = await uow.tournaments.getById(tournamentId);
    const match = await uow.matches.getById(matchId);
    const tickets = await uow.tickets.getByMatch(matchId);

    console.log(`   Турнір: "${tour?.name}", команд зареєстровано: ${tour?.teams_count}`);
    console.log(
      `   Матч #${match?.id}: ${match?.home_team_name} vs ${match?.away_team_name} (вільних місць: ${match?.available_seats})`
    );
    console.log(`   Продано квитків на матч: ${tickets.length}`);

    return { teamId, matchId };
  });
}

// 2. Відкат транзакції (rollback) при спробі видалити команду активного турніру
async function scenario2Rollback(teamId: number): Promise<void> {
  printTitle('2. Відкат транзакції (rollback) при порушенні бізнес-правила');

  await UnitOfWork.run(ORGANIZER_ID, async (uow) => {
    try {
      await uow.teams.update(teamId, undefined, 'Тимчасове Місто');
      console.log('   Місто команди змінено в межах транзакції (ще не зафіксовано)...');

      // Спроба видалити команду, яка грає в активному турнірі -> помилка від процедури
      await uow.teams.softDelete(teamId);
      await uow.commit();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`   БД відхилила операцію: ${msg}`);
      await uow.rollback();
    }

    const team = await uow.teams.getById(teamId);
    console.log(`   Місто команди після rollback: "${team?.city}"`);
  });
}

// 3. Soft delete, відновлення та перевірка полів updated_at / updated_by
async function scenario3SoftDeleteAndRestore(): Promise<void> {
  printTitle('3. Soft delete, відновлення та фіксація користувача (updated_by)');

  await UnitOfWork.run(ADMIN_ID, async (uow) => {
    const tempTeamId = await uow.teams.create(1, 'ФК Тимчасовий', 'Одеса', 2020);
    await uow.commit();

    await uow.teams.softDelete(tempTeamId);
    await uow.commit();

    const afterDelete = await uow.teams.getById(tempTeamId);
    console.log(`   Видна у v_teams після soft delete: ${afterDelete !== null}`);

    await uow.teams.restore(tempTeamId);
    await uow.commit();

    const afterRestore = await uow.teams.getById(tempTeamId);
    console.log(
      `   Видна після restore: ${afterRestore !== null} (updated_by=${afterRestore?.updated_by}, updated_at=${afterRestore?.updated_at?.toISOString()})`
    );
  });
}

// 4. Запис результату матчу та перегляд турнірної таблиці
async function scenario4ResultAndStandings(matchId: number): Promise<void> {
  printTitle('4. Запис результату матчу та перегляд турнірної таблиці');

  await UnitOfWork.run(ORGANIZER_ID, async (uow) => {
    await uow.matches.recordResult(matchId, 3, 1, 'Матч Кубка України');
    await uow.commit();

    const match = await uow.matches.getById(matchId);
    console.log(
      `   Матч #${match?.id} (${match?.home_team_name} - ${match?.away_team_name}): статус=${match?.status}, рахунок=${match?.home_score}:${match?.away_score}`
    );

    const standings = await uow.tournaments.getStandings(1);
    console.log("\n   Турнірна таблиця (Прем'єр-ліга України):");
    for (const row of standings) {
      console.log(
        `     ${row.position}. ${row.team_name.padEnd(16)} І:${row.played} В:${row.won} Н:${row.drawn} П:${row.lost} М:${row.goals_for}-${row.goals_against} О:${row.points}`
      );
    }
  });
}

async function main(): Promise<void> {
  try {
    const { teamId, matchId } = await scenario1CreateCupMatchAndTickets();
    await scenario2Rollback(teamId);
    await scenario3SoftDeleteAndRestore();
    await scenario4ResultAndStandings(matchId);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Помилка виконання демо:', err);
  process.exit(1);
});
