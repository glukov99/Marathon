#!/usr/bin/env python3
"""Put the plan's strength sessions on the Garmin calendar, so the watch shows each day's exact version.

  ~/.venvs/garmin/bin/python training/garmin_push.py login       once: email, password, MFA code
  ~/.venvs/garmin/bin/python training/garmin_push.py push        the next 14 days
  ... push --days 28 --from 2026-11-02 --dry                     --dry prints and touches nothing
  ~/.venvs/garmin/bin/python training/garmin_push.py check       no network: every exercise is a real Garmin one

Reads training/plan.js through node, the same data the page shows. One Garmin workout per version of a
session ("LH Gym A · W1"), scheduled on every day that uses it. Running it again changes only what is wrong.
Exercises done per leg or per side get a Left and a Right step, so the watch counts each leg's set.
The login lives in ~/.garminconnect, never in this repo. Needs: pip install "garminconnect[workout]".
Known gap: trips and lighter weeks are decided in the browser, so for those weeks the watch gets the base plan.
"""
import argparse, datetime as dt, getpass, hashlib, json, re, subprocess, sys
from pathlib import Path

TOKENS = '~/.garminconnect'
PLAN = Path(__file__).with_name('plan.js')
PREFIX = 'LH '
EXPORT = r"""
const P=new Function(require('fs').readFileSync(process.argv[1],'utf8')+';return {W,EX,START}')();
const out=[];P.W.forEach((w,wi)=>w.days.forEach((xs,d)=>xs.forEach(x=>{if(!x.ex)return;
  const t=new Date(P.START);t.setDate(t.getDate()+wi*7+d);
  out.push({date:t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0'),week:wi+1,t:x.t,d:x.d,ex:x.ex})})));
process.stdout.write(JSON.stringify({sessions:out,EX:P.EX}));
"""


def plan():
    return json.loads(subprocess.check_output(['node', '-e', EXPORT, str(PLAN)]))


def amount(a):
    """Plan amount -> ('reps', n) | ('time', seconds) | ('lap', label). Distances and 'max' end on the lap button."""
    if isinstance(a, (int, float)):
        return 'reps', a
    if m := re.fullmatch(r'(\d+) s', a): return 'time', int(m[1])
    if m := re.fullmatch(r'(\d+) min', a): return 'time', int(m[1]) * 60
    if m := re.fullmatch(r'(\d+):(\d\d)', a): return 'time', int(m[1]) * 60 + int(m[2])
    return 'lap', a


def build(name, desc, ex, EX):
    """A plan session as a Garmin strength workout. Rest between rounds ends on the lap button."""
    from garminconnect.workout import StrengthWorkout, WorkoutSegment, ExecutableStep, create_repeat_group, _strength_exercise_step
    order = 0

    def nxt():
        nonlocal order
        order += 1
        return order

    LAP = {'conditionTypeId': 1, 'conditionTypeKey': 'lap.button', 'displayOrder': 1, 'displayable': True}
    END = {'reps': {'conditionTypeId': 10, 'conditionTypeKey': 'reps', 'displayOrder': 10, 'displayable': True},
           'time': {'conditionTypeId': 2, 'conditionTypeKey': 'time', 'displayOrder': 2, 'displayable': True}}

    def step(key, a, how, side=''):
        kind, v = amount(a)
        e = EX[key]
        note = ', '.join(x for x in (side, '' if kind != 'lap' else str(v), how) if x)
        return _strength_exercise_step(e[1], nxt(), END.get(kind, LAP), float(v) if kind != 'lap' else None, e[2], None, note or None)

    def rest():
        return ExecutableStep(stepOrder=nxt(), stepType={'stepTypeId': 5, 'stepTypeKey': 'rest', 'displayOrder': 5}, endCondition=LAP,
                              targetType={'workoutTargetTypeId': 1, 'workoutTargetTypeKey': 'no.target', 'displayOrder': 1})

    steps = []
    for n, rows, note in ex:
        group = nxt() if n > 1 else None
        inner = []
        for key, a, how in (r + [''] * (3 - len(r)) for r in rows):
            per = re.match(r'each (leg|side)(, )?', how or '')
            if per:  # one step per leg: the watch counts each leg's set, as Garmin logs it
                rest_how = how[per.end():]
                inner += [step(key, a, rest_how, 'Left'), step(key, a, rest_how, 'Right')]
            else:
                inner.append(step(key, a, how))
        if n > 1:
            inner.append(rest())
            g = create_repeat_group(n, inner, group, skip_last_rest_step=True)
            if note: g.description = note
            steps.append(g)
        else:
            steps += inner
    w = StrengthWorkout(workoutName=name, description=desc[:1000], estimatedDurationInSecs=0,
                        workoutSegments=[WorkoutSegment(segmentOrder=1, sportType={'sportTypeId': 5, 'sportTypeKey': 'strength_training'}, workoutSteps=steps)])
    return w.to_dict()


def versions(sessions, EX):
    """Group the plan's sessions into versions: same exercises and sets = one Garmin workout, named after its first week."""
    out = {}
    for s in sessions:
        sig = hashlib.sha1(json.dumps([s['t'], s['ex']]).encode()).hexdigest()[:8]
        if sig not in out:
            short = s['t'].split(':')[0]
            out[sig] = {'sig': sig, 'name': f"{PREFIX}{short} · W{s['week']}", 'desc': f"{s['d']} [lh:{sig}]", 'ex': s['ex'], 'dates': []}
        out[sig]['dates'].append(s['date'])
    for v in out.values():
        v['json'] = build(v['name'], v['desc'], v['ex'], EX)
    return out


def api():
    from garminconnect import Garmin
    g = Garmin()
    g.login(TOKENS)
    return g


def login():
    from garminconnect import Garmin
    g = Garmin(input('Garmin email: '), getpass.getpass('Garmin password: '), prompt_mfa=lambda: input('MFA code: '))
    g.login(TOKENS)
    print('Logged in as', g.get_full_name(), '- tokens saved in', TOKENS)


def push(start, days, dry):
    p = plan()
    end = (dt.date.fromisoformat(start) + dt.timedelta(days=days - 1)).isoformat()
    vs = versions(p['sessions'], p['EX'])
    todo = {d: v for v in vs.values() for d in v['dates'] if start <= d <= end}
    for d in sorted(todo):
        print(d, todo[d]['name'])
    if dry:
        print(json.dumps(next(iter(todo.values()))['json'], ensure_ascii=False, indent=1) if todo else 'nothing in range')
        return
    g = api()
    mine = {}
    page = 0
    while batch := g.get_workouts(page, 100):
        mine.update({w['workoutName']: w for w in batch if w.get('workoutName', '').startswith(PREFIX)})
        page += 100
    ids = {}
    for v in {id(v): v for v in todo.values()}.values():
        old = mine.get(v['name'])
        if old and f"[lh:{v['sig']}]" in (old.get('description') or ''):
            ids[v['sig']] = old['workoutId']
        elif old:  # same name, the plan changed: update it in place
            g.update_workout(old['workoutId'], {**v['json'], 'workoutId': old['workoutId']})
            ids[v['sig']] = old['workoutId']
            print('updated', v['name'])
        else:
            ids[v['sig']] = g.upload_workout(v['json'])['workoutId']
            print('created', v['name'])
    on = {}  # what our calendar already holds: date -> [(scheduled id, workout id)]
    for y, m in sorted({(int(d[:4]), int(d[5:7])) for d in todo}):
        for it in g.get_scheduled_workouts(y, m).get('calendarItems', []):
            if it.get('itemType') == 'workout' and (it.get('title') or '').startswith(PREFIX):
                on.setdefault(it['date'], []).append((it['id'], it.get('workoutId')))
    for d, v in sorted(todo.items()):
        have = on.get(d, [])
        if any(w == ids[v['sig']] for _, w in have):
            continue
        for sid, _ in have:  # an older version of ours on that day
            g.unschedule_workout(sid)
        g.schedule_workout(ids[v['sig']], d)
        print('scheduled', d, v['name'])
    print('done')


def check():
    from garminconnect.exercises import EXERCISES
    real = {(e['category'], e['exercise']) for e in EXERCISES} | {(e['category'], '') for e in EXERCISES}
    p = plan()
    bad = [k for k, e in p['EX'].items() if (e[1], e[2]) not in real]
    assert not bad, f'not in the Garmin catalog: {bad}'
    vs = versions(p['sessions'], p['EX'])  # builds every version, so a bad amount fails here
    assert all(v['json']['workoutSegments'][0]['workoutSteps'] for v in vs.values())
    print(f"garmin check ok: {len(p['EX'])} exercises, {len(vs)} workouts, {sum(len(v['dates']) for v in vs.values())} days")


if __name__ == '__main__':
    a = argparse.ArgumentParser()
    a.add_argument('cmd', choices=['login', 'push', 'check'])
    a.add_argument('--from', dest='start', default=dt.date.today().isoformat())
    a.add_argument('--days', type=int, default=14)
    a.add_argument('--dry', action='store_true')
    o = a.parse_args()
    {'login': login, 'check': check}.get(o.cmd, lambda: push(o.start, o.days, o.dry))()
