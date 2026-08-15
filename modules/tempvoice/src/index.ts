// Entry point cho module tempvoice (CLAUDE.md §4).
// EN: Entry point for the tempvoice module.
//
// Logic chính nằm ở events/voiceStateUpdate.ts — module này chỉ khai báo hooks lifecycle
// (core gọi khi load/unload). State kênh tạm nằm trong src/tempvoice.ts (module-scope).