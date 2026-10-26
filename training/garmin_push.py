#!/usr/bin/env python3
"""Put the plan's strength sessions and yoga routines on the Garmin calendar, so the watch shows each day's exact version.

  ~/.venvs/garmin/bin/python training/garmin_push.py login       once: email, password, MFA code
  ~/.venvs/garmin/bin/python training/garmin_push.py push        the next 14 days
  ... push --days 28 --from 2026-11-02 --dry                     --dry prints and touches nothing
  ~/.venvs/garmin/bin/python training/garmin_push.py check       no network: every exercise and pose is a real Garmin one

Reads training/plan.js through node, the same data the page shows. One Garmin workout per version of a strength
session ("LH Gym A · W1") and one per yoga routine ("LH Post-training stretch"), scheduled on every day that uses it.
Running it again changes only what is wrong. Exercises done per leg or per side get a Left and a Right step, so the
watch counts each leg's set. The login lives in ~/.garminconnect, never in this repo.
Needs: pip install "garminconnect[workout]". Weekly run: ~/Library/LaunchAgents/com.lifehub.garmin-push.plist.
Known gap: trips and lighter weeks are decided in the browser, so for those weeks the watch gets the base plan.
"""
import argparse, datetime as dt, getpass, hashlib, json, re, subprocess
from pathlib import Path

TOKENS = '~/.garminconnect'
PLAN = Path(__file__).with_name('plan.js')
PREFIX = 'LH '
YOGA_POSES = Path(__file__).with_name('garmin-yoga-poses.json')  # keys from connect.garmin.com/web-data/exercises/Yoga.json, Oct 2026
EXPORT = r"""
const P=new Function(require('fs').readFileSync(process.argv[1],'utf8')+';return {W,EX,START,ROUTINE}')();
const out=[];P.W.forEach((w,wi)=>w.days.forEach((xs,d)=>xs.forEach(x=>{if(!x.ex&&!x.then&&!x.rt)return;
  const t=new Date(P.START);t.setDate(t.getDate()+wi*7+d);
  out.push({date:t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0'),week:wi+1,t:x.t,d:x.d,ex:x.ex,then:x.then,rt:x.rt})})));
process.stdout.write(JSON.stringify({sessions:out,EX:P.EX,ROUTINE:P.ROUTINE}));
"""
STRENGTH = {'sportTypeId': 5, 'sportTypeKey': 'strength_training', 'displayOrder': 5}
YOGA = {'sportTypeId': 7, 'sportTypeKey': 'yoga', 'displayOrder': 7}
LAP = {'conditionTypeId': 1, 'conditionTypeKey': 'lap.button', 'displayOrder': 1, 'displayable': True}
END = {'reps': {'conditionTypeId': 10, 'conditionTypeKey': 'reps', 'displayOrder': 10, 'displayable': True},
       'time': {'conditionTypeId': 2, 'conditionTypeKey': 'time', 'displayOrder': 2, 'displayable': True}}


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


def workout(name, desc, sport, steps):
    from garminconnect.workout import StrengthWorkout, WorkoutSegment
    w = StrengthWorkout(workoutName=name, description=desc[:1000], estimatedDurationInSecs=0, sportType=sport,
                        workoutSegments=[WorkoutSegment(segmentOrder=1, sportType=sport, workoutSteps=steps)])
    return w.to_dict()


def build(name, desc, ex, EX):
    """A plan session as a Garmin strength workout. Rest between rounds ends on the lap button."""
    from garminconnect.workout import ExecutableStep, create_repeat_group, _strength_exercise_step
    order = 0

    def nxt():
        nonlocal order
        order += 1
        return order

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
    return workout(name, desc, STRENGTH, steps)


def build_yoga(name, desc, R):
    """A yoga routine as a Garmin yoga workout: one timed step per pose, the side and the cue in the step note."""
    from garminconnect.workout import _strength_exercise_step
    steps = []
    for i, s in enumerate(R['steps']):
        what, secs, how, cat, pose = s[:5]
        note = ', '.join(x for x in ((s[5] if len(s) > 5 else ''), what, how) if x)
        steps.append(_strength_exercise_step(cat, i + 1, END['time'], float(secs), pose, None, note[:500]))
    return workout(name, desc, YOGA, steps)


def versions(sessions, EX, ROUTINE):
    """Group what the plan asks for into Garmin workouts. Strength: same exercises and sets = one workout, named after
    its first week. Yoga: one workout per routine. Each version lists the dates that use it."""
    out = {}

    def add(sig, name, desc, make, date):
        if sig not in out:
            out[sig] = {'sig': sig, 'name': name, 'desc': f'{desc} [lh:{sig}]', 'make': make, 'dates': []}
        if date not in out[sig]['dates']:
            out[sig]['dates'].append(date)

    for s in sessions:
        if s.get('ex'):
            sig = hashlib.sha1(json.dumps([s['t'], s['ex']]).encode()).hexdigest()[:8]
            add(sig, f"{PREFIX}{s['t'].split(':')[0]} · W{s['week']}", s['d'], lambda n, d, s=s: build(n, d, s['ex'], EX), s['date'])
        for k in filter(None, (s.get('then'), s.get('rt'))):  # after-session routine, or the day's PM yoga
            R = ROUTINE[k]
            sig = hashlib.sha1(json.dumps(R).encode()).hexdigest()[:8]
            add(sig, f"{PREFIX}{R['t']}", R['when'], lambda n, d, R=R: build_yoga(n, d, R), s['date'])
    for v in out.values():
        v['json'] = v.pop('make')(v['name'], v['desc'])
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
    vs = versions(p['sessions'], p['EX'], p['ROUTINE'])
    want = {}  # date -> [version]
    for v in vs.values():
        for d in v['dates']:
            if start <= d <= end:
                want.setdefault(d, []).append(v)
    for d in sorted(want):
        print(d, ' + '.join(v['name'] for v in want[d]))
    if dry:
        return
    g = api()
    mine, page = {}, 0
    while batch := g.get_workouts(page, 100):
        mine.update({w['workoutName']: w for w in batch if w.get('workoutName', '').startswith(PREFIX)})
        page += 100
    ids = {}
    for v in {v['sig']: v for vl in want.values() for v in vl}.values():
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
    on = {}  # what our calendar already holds: date -> {scheduled id: workout id}
    for y, m in sorted({(int(d[:4]), int(d[5:7])) for d in want}):
        for it in g.get_scheduled_workouts(y, m).get('calendarItems', []):
            if it.get('itemType') == 'workout' and (it.get('title') or '').startswith(PREFIX):
                on.setdefault(it['date'], {})[it['id']] = it.get('workoutId')
    for d in sorted(want):
        need = {ids[v['sig']] for v in want[d]}
        have = on.get(d, {})
        for sid, wid in have.items():
            if wid not in need:  # an older version of ours on that day
                g.unschedule_workout(sid)
                print('unscheduled', d, wid)
        for v in want[d]:
            if ids[v['sig']] not in have.values():
                g.schedule_workout(ids[v['sig']], d)
                print('scheduled', d, v['name'])
    print('done')


def check():
    from garminconnect.exercises import EXERCISES
    real = {(e['category'], e['exercise']) for e in EXERCISES} | {(e['category'], '') for e in EXERCISES}
    p = plan()
    bad = [k for k, e in p['EX'].items() if (e[1], e[2]) not in real]
    assert not bad, f'not in the Garmin catalog: {bad}'
    poses = {(c, n) for c, v in json.loads(YOGA_POSES.read_text()).items() for n in v}
    bad = [(k, s[3], s[4]) for k, R in p['ROUTINE'].items() for s in R['steps'] if (s[3], s[4]) not in poses]
    assert not bad, f'not in the Garmin yoga catalog: {bad}'
    vs = versions(p['sessions'], p['EX'], p['ROUTINE'])  # builds every workout, so a bad amount fails here
    assert all(v['json']['workoutSegments'][0]['workoutSteps'] for v in vs.values())
    print(f"garmin check ok: {len(p['EX'])} exercises, {len(p['ROUTINE'])} routines, {len(vs)} workouts, "
          f"{sum(len(v['dates']) for v in vs.values())} workout days")


if __name__ == '__main__':
    a = argparse.ArgumentParser()
    a.add_argument('cmd', choices=['login', 'push', 'check'])
    a.add_argument('--from', dest='start', default=dt.date.today().isoformat())
    a.add_argument('--days', type=int, default=14)
    a.add_argument('--dry', action='store_true')
    o = a.parse_args()
    {'login': login, 'check': check}.get(o.cmd, lambda: push(o.start, o.days, o.dry))()
