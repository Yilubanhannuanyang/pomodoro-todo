const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'database.json');

let data;
let nextId = 1;

function load() {
  try {
    if (fs.existsSync(dbPath)) {
      data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
      nextId = data._next_id || 1;
    }
  } catch (e) { /* ignore */ }
  if (!data || !data.users) {
    data = { users: [], rooms: [], room_members: [], tasks: [], pomodoro_sessions: [], user_streaks: [], _next_id: 1 };
    nextId = 1;
  }
}

function save() {
  data._next_id = nextId;
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8');
}

function uid() { return nextId++; }
function today() { return new Date().toISOString().slice(0, 10); }
function now() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }

load();

// Each table has insert, all, get, update, remove helpers
// Using an exports wrapper that matches the sqlite-style API used in route files

function makeTable(name) {
  const table = data[name];

  return {
    _table: table,

    insert(obj) {
      obj.id = uid();
      table.push(obj);
      save();
      return { changes: 1, lastInsertRowid: obj.id };
    },

    insertOrReplace(match, obj) {
      const keys = Object.keys(match);
      const existing = table.find(r => keys.every(k => r[k] === match[k]));
      if (existing) {
        const id = existing.id;
        Object.assign(existing, obj, { id });
        save();
        return { changes: 1, lastInsertRowid: id };
      }
      obj.id = uid();
      table.push(obj);
      save();
      return { changes: 1, lastInsertRowid: obj.id };
    },

    findWhere(conditions) {
      return table.filter(r => {
        return Object.entries(conditions).every(([k, v]) => r[k] == v);
      });
    },

    findOne(conditions) {
      return table.find(r => {
        return Object.entries(conditions).every(([k, v]) => r[k] == v);
      }) || null;
    },

    updateWhere(conditions, updates) {
      let changes = 0;
      for (const r of table) {
        if (Object.entries(conditions).every(([k, v]) => r[k] == v)) {
          Object.assign(r, updates);
          changes++;
        }
      }
      if (changes > 0) save();
      return { changes };
    },

    removeWhere(conditions) {
      const before = table.length;
      data[name] = table.filter(r => {
        return !Object.entries(conditions).every(([k, v]) => r[k] == v);
      });
      const changes = before - data[name].length;
      if (changes > 0) save();
      return { changes };
    },

    all() { return table; },

    count(conditions) {
      return table.filter(r => Object.entries(conditions).every(([k, v]) => r[k] == v)).length;
    },

    aggregate(options) {
      // options: { match, groupBy, sort, limit, aggregates: { col: 'SUM'|'COUNT' } }
      let rows = options.match ? this.findWhere(options.match) : [...table];
      if (options.groupBy) {
        const groups = {};
        for (const r of rows) {
          const key = r[options.groupBy];
          if (!groups[key]) groups[key] = { key, rows: [], ...options.initial || {} };
          groups[key].rows.push(r);
          if (options.aggregates) {
            for (const [col, fn] of Object.entries(options.aggregates)) {
              if (fn === 'COUNT') groups[key][col] = (groups[key][col] || 0) + 1;
              else if (fn === 'SUM') groups[key][col] = (groups[key][col] || 0) + (r[col] || 0);
            }
          }
        }
        rows = Object.values(groups).map(g => ({ ...g.rows[0], ...g }));
      }
      if (options.sort) {
        const [col, dir] = options.sort;
        rows.sort((a, b) => dir === 'DESC' ? (b[col] || 0) - (a[col] || 0) : (a[col] || 0) - (b[col] || 0));
      }
      if (options.limit) rows = rows.slice(0, options.limit);
      return rows;
    },
  };
}

const users = makeTable('users');
const rooms = makeTable('rooms');
const roomMembers = makeTable('room_members');
const tasks = makeTable('tasks');
const sessions = makeTable('pomodoro_sessions');
const streaks = makeTable('user_streaks');

module.exports = {
  users,
  rooms,
  roomMembers,
  tasks,
  sessions,
  streaks,
  today,
  now,
};
