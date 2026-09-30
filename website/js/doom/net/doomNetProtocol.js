/**
 * The messages of a multiplayer session and their vocabulary: the control
 * messages the main and a sub say to each other outside the turn stream
 * (JSON, through NetPeer.sendControl), and the type byte of the binary turn
 * messages.
 */
class DoomNetProtocol {
}

// Sub → main, once its link is open: it joins the session and waits for its welcome.
DoomNetProtocol.HELLO        = 'hello';
// Main → a sub: who it is in the session (playerId, slot) and how the session plays (mode, options);
// sent again to every sub when the mode changes.
DoomNetProtocol.WELCOME      = 'welcome';
// Main → every sub: the lobby as it stands (DoomNetLobby.toData).
DoomNetProtocol.LOBBY        = 'lobby';
// Main → every sub: the game runs.
DoomNetProtocol.START        = 'start';
// Main → a sub: the level to build (seq, levelCode, skill, multiplayerThings, mode, options), and the sub is syncing.
DoomNetProtocol.LEVEL_LOAD   = 'levelLoad';
// Sub → main: the level of that seq is built, the sub joins the turn cycle with the next state.
DoomNetProtocol.LEVEL_READY  = 'levelReady';
// Main → the subs it is not waiting for: the nicknames it waits for (none clears it).
DoomNetProtocol.WAITING      = 'waiting';
// Main → every sub in the cycle: the main paused its game, no turn runs until the next state.
DoomNetProtocol.PAUSE        = 'pause';
// Main → every sub in the cycle: the level is over (secret, stats) — the tally.
DoomNetProtocol.INTERMISSION = 'intermission';
// Main → every sub in the cycle: the tally gives way to the chapter's story text (secret, stats again).
DoomNetProtocol.FINALE       = 'finale';
// Either side: the session ends for the receiver, with one of the END_* reasons.
DoomNetProtocol.SESSION_END  = 'sessionEnd';

DoomNetProtocol.END_STOPPED   = 'stopped';  // the main stopped the session
DoomNetProtocol.END_REMOVED   = 'removed';  // the main removed that sub
DoomNetProtocol.END_TIMEOUT   = 'timeout';  // that sub's command never came: too slow a link
DoomNetProtocol.END_LEFT      = 'left';     // the sub left
DoomNetProtocol.END_LOST      = 'lost';     // the link went silent or failed
DoomNetProtocol.END_GAME_OVER = 'gameOver'; // the main finished its game

DoomNetProtocol.MODE_SCREEN_SHARING = 1;
DoomNetProtocol.MODE_COOPERATIVE    = 2;

// First byte of a binary message (0xFF is the network layer's chunk).
DoomNetProtocol.MESSAGE_STATE   = 1;   // main → subs, every turn
DoomNetProtocol.MESSAGE_COMMAND = 2;   // sub → main, every turn

// A side that ends a session closes the link itself if the other side has not
// done it by then: its closing message must get through first.
DoomNetProtocol.END_GRACE_MS = 1000;
