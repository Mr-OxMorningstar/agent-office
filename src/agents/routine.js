// Placeholder behaviour until agents are driven by real activity events:
// walk in, cross the floor, plan at the boardroom board, head back out, repeat.
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runDemoRoutine(agent, spots) {
  const room = spots.boardroom;

  for (;;) {
    agent.position.copy(spots.entranceOutside);
    agent.setStatus('Arriving');
    await agent.walkTo([spots.entranceInside, spots.floorCentre]);

    agent.setStatus('Thinking…');
    await wait(2500);

    agent.setStatus('Heading to the boardroom');
    await agent.walkTo([room.doorOutside, room.doorInside, room.aisleFront, room.aisleBack, room.atBoard]);
    agent.faceTowards(room.board);

    agent.setStatus('Planning at the board');
    await wait(5000);

    agent.setStatus('Done — leaving');
    await agent.walkTo([room.aisleBack, room.aisleFront, room.doorInside, room.doorOutside, spots.entranceInside, spots.entranceOutside]);
    agent.setStatus(null);
    await wait(1500);
  }
}
