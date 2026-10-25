/**
 * Akamas Short Mat Bowls Club - Draw Lots Randomiser
 * Module: Symmetrical Headcount Allocations & Dynamic Table Exporters
 */

function executeDynamicDrawLots() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const attendanceSheet = ss.getSheetByName("Attendance");
  const drawLotsSheet = ss.getSheetByName("Draw Lots");
  
  if (!attendanceSheet || !drawLotsSheet) return { success: false, error: "Essential sheets missing." };
  
  const todayStr = Utilities.formatDate(new Date(), "Asia/Nicosia", "yyyy-MM-dd");
  const attendanceData = attendanceSheet.getDataRange().getValues();
  let presentMemberIDs = [];
  
  for (let i = 1; i < attendanceData.length; i++) {
    const rawDate = attendanceData[i][3]; // Column D = session_date
    const checkDate = rawDate instanceof Date ? Utilities.formatDate(rawDate, "Asia/Nicosia", "yyyy-MM-dd") : String(rawDate || "").substring(0, 10).trim();
    const memberID = String(attendanceData[i][1]).trim().toUpperCase(); // Column B = bowler_id
    
    if (checkDate === todayStr && memberID && presentMemberIDs.indexOf(memberID) === -1) {
      presentMemberIDs.push(memberID);
    }
  }
  
  // Dynamic Tester Fallback: If no players checked in yet today, auto-pool your 20 live scenario keys
  if (presentMemberIDs.length === 0) {
    for (let k = 1; k <= 20; k++) presentMemberIDs.push(`MBR${String(k).padStart(3, '0')}`);
  }
  
  // Fisher-Yates Complete Randomisation Shuffle Pass
  for (let m = presentMemberIDs.length - 1; m > 0; m--) {
    const j = Math.floor(Math.random() * (m + 1));
    const temp = presentMemberIDs[m];
    presentMemberIDs[m] = presentMemberIDs[j];
    presentMemberIDs[j] = temp;
  }
  
  const totalPlayers = presentMemberIDs.length;
  const matLayout = calculateSymmetricalMatSlices(totalPlayers);
  
  drawLotsSheet.clearContents();
  drawLotsSheet.appendRow(["session_date", "mat_number", "assigned_bowlers", "status", "generated_timestamp"]);
  
  let playerPointer = 0;
  const timestamp = Utilities.formatDate(new Date(), "Asia/Nicosia", "yyyy-MM-dd HH:mm:ss");
  
  for (let matIdx = 0; matIdx < matLayout.length; matIdx++) {
    const matNum = matIdx + 1;
    const headcount = matLayout[matIdx];
    const matGroup = presentMemberIDs.slice(playerPointer, playerPointer + headcount);
    playerPointer += headcount;
    
    buildTeamRoleMatrix(drawLotsSheet, todayStr, matNum, matGroup, timestamp);
  }
  
  return { success: true, totalPlayersAssigned: totalPlayers, matsUtilised: matLayout.length };
}

function calculateSymmetricalMatSlices(count) {
  if (count === 15) return; 
  if (count === 20) return; 
  if (count === 12) return; 
  if (count === 10) return; 
  
  const base = Math.floor(count / 3);
  const rem = count % 3;
  if (rem === 0) return [base, base, base];
  if (rem === 1) return [base + 1, base, base];
  return [base + 1, base + 1, base];
}

function buildTeamRoleMatrix(sheet, dateStr, matNum, players, timestamp) {
  const count = players.length;
  
  if (count === 3) {
    sheet.appendRow([dateStr, matNum, players[0], "Singles RED", timestamp]);
    sheet.appendRow([dateStr, matNum, players[1], "Singles BLUE", timestamp]);
    sheet.appendRow([dateStr, matNum, players[2], "Singles WHITE", timestamp]);
    return;
  }
  
  const half = Math.floor(count / 2);
  const redTeam = players.slice(0, half);
  const blueTeam = players.slice(half);
  
  const applyRoles = (team, color) => {
    team.forEach((id, idx) => {
      let role = "Player";
      if (team.length === 1) role = "Singles";
      else if (team.length === 2) role = idx === 0 ? "Lead" : "Skip";
      else if (team.length === 3) role = idx === 0 ? "Lead" : (idx === 1 ? "2ND" : "Skip");
      else if (team.length === 4) role = idx === 0 ? "Lead" : (idx === 1 ? "2ND" : (idx === 2 ? "3RD" : "Skip"));
      sheet.appendRow([dateStr, matNum, id, `${role} ${color}`, timestamp]);
    });
  };
  
  applyRoles(redTeam, "RED");
  applyRoles(blueTeam, "BLUE");
}

function getLiveDrawLotsRows() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Draw Lots");
  if (!sheet || sheet.getLastRow() <= 1) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
}
