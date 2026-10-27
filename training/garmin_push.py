#!/usr/bin/env python3
"""Put the plan's runs, strength sessions and yoga routines on the Garmin calendar, so the watch shows each day's exact version.

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
const RUNZ=['easy','rec','st','hard','mp','vert'];
const out=[];P.W.forEach((w,wi)=>w.days.forEach((xs,d)=>xs.forEach(x=>{const run=RUNZ.includes(x.z)&&x.m>0;if(!x.ex&&!x.then&&!x.rt&&!run)return;
  const t=new Date(P.START);t.setDate(t.getDate()+wi*7+d);
  out.push({date:t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0'),week:wi+1,t:x.t,d:x.d,m:x.m,z:x.z,ex:x.ex,then:x.then,rt:x.rt,run:run?(x.run||null):undefined})})));
process.stdout.write(JSON.stringify({sessions:out,EX:P.EX,ROUTINE:P.ROUTINE}));
"""
STRENGTH_BUILD = 2  # bump when build() changes, so every strength workout on Garmin is updated
STRENGTH = {'sportTypeId': 5, 'sportTypeKey': 'strength_training', 'displayOrder': 5}
RUNNING = {'sportTypeId': 1, 'sportTypeKey': 'running', 'displayOrder': 1}
DIST = {'conditionTypeId': 3, 'conditionTypeKey': 'distance', 'displayOrder': 3, 'displayable': True}
NO_TARGET = {'workoutTargetTypeId': 1, 'workoutTargetTypeKey': 'no.target', 'displayOrder': 1}
OLD_RUN = re.compile(r'^W\d+ ')  # run workouts Intervals.icu made from the plan before this script did runs
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
    for bi, (n, rows, note) in enumerate(ex):
        if bi:  # rest before the next exercise too, so the watch does not go straight into it (that ran like a superset)
            steps.append(rest())
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


def auto_run(s):
    """Steps for a run the plan gives as text: an HR from "HR a–b" or "HR under N", strides from "N strides".
    Vert: HR 140–160, so a slow run up stays aerobic (walk when it goes over). Hikes and trails get time only."""
    d, secs = s.get('d') or '', s['m'] * 60
    if s['z'] == 'vert':
        return [['run', secs, 'hr:140-160', 'Run up slowly, walk when HR goes over 160. Jog down easy. ' + d]]
    if re.search(r'hike|trail|hill|course|kit|headlamp|explore|section', d + ' ' + s['t'], re.I):
        return [['run', secs, None, d]]
    if m := re.search(r'HR (\d+)–(\d+)', d): hr = f'hr:{m[1]}-{m[2]}'
    elif m := re.search(r'HR under (\d+)', d): hr = f'hr:{int(m[1]) - 30}-{m[1]}'
    else: hr = 'hr:118-148' if s['z'] == 'rec' else 'hr:148-160'
    n = int(m[1]) if (m := re.search(r'(\d+)(?:×20 s)? strides', d)) else 0
    steps = [['run', secs - n * 60, hr, d]]
    if n:
        steps.append(['repeat', n, [['run', 20, None, 'Stride: fast and relaxed'], ['recovery', 40, None, 'Walk or jog back']]])
    return steps


def pace_s(p):
    mm, ss = p.split(':')
    return int(mm) * 60 + int(ss)


def build_run(name, desc, steps):
    """A plan run as a Garmin running workout: steps with an HR (bpm) or pace (m/s, slower first) target."""
    from garminconnect.workout import ExecutableStep, create_repeat_group
    order = 0
    KIND = {'warmup': (1, 'warmup'), 'cooldown': (2, 'cooldown'), 'run': (3, 'interval'), 'recovery': (4, 'recovery')}

    def nxt():
        nonlocal order
        order += 1
        return order

    def target(t):
        if not t:
            return {'targetType': NO_TARGET}
        kind, v = t.split(':', 1)
        if kind == 'hr':
            lo, hi = map(float, v.split('-'))
            return {'targetType': {'workoutTargetTypeId': 4, 'workoutTargetTypeKey': 'heart.rate.zone', 'displayOrder': 4},
                    'targetValueOne': lo, 'targetValueTwo': hi}
        slow, fast = (pace_s(x) for x in v.split('-')) if '-' in v else (pace_s(v) + 5, pace_s(v) - 5)
        return {'targetType': {'workoutTargetTypeId': 6, 'workoutTargetTypeKey': 'pace.zone', 'displayOrder': 6},
                'targetValueOne': 1000 / slow, 'targetValueTwo': 1000 / fast}

    def step(st):
        if st[0] == 'repeat':
            group = nxt()
            return create_repeat_group(st[1], [step(x) for x in st[2]], group)
        kind, end, tgt, note = (st + [None, None])[:4]
        tid, tkey = KIND[kind]
        if end == 'lap': cond, val = LAP, None
        elif isinstance(end, str): cond, val = DIST, float(end.split()[0])
        else: cond, val = END['time'], float(end)
        return ExecutableStep(stepOrder=nxt(), stepType={'stepTypeId': tid, 'stepTypeKey': tkey, 'displayOrder': tid},
                              endCondition=cond, endConditionValue=val, description=(note or None) and note[:500], **target(tgt))

    return workout(name, desc, RUNNING, [step(st) for st in steps])


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
        if 'run' in s:
            steps = s['run'] or auto_run(s)
            sig = hashlib.sha1(json.dumps([s['t'], steps]).encode()).hexdigest()[:8]
            add(sig, f"{PREFIX}{s['t']} · W{s['week']}", s['d'], lambda n, d, st=steps: build_run(n, d, st), s['date'])
        if s.get('ex'):
            sig = hashlib.sha1(json.dumps([s['t'], s['ex'], STRENGTH_BUILD]).encode()).hexdigest()[:8]
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
    on, old = {}, {}  # date -> {scheduled id: workout id}: ours, and the plan's runs as Intervals.icu made them
    for y, m in sorted({(int(d[:4]), int(d[5:7])) for d in want}):
        for it in g.get_scheduled_workouts(y, m).get('calendarItems', []):
            title = it.get('title') or ''
            if it.get('itemType') == 'workout' and title.startswith(PREFIX):
                on.setdefault(it['date'], {})[it['id']] = it.get('workoutId')
            elif it.get('itemType') == 'workout' and OLD_RUN.match(title) and it['date'] in want:
                old[it['id']] = (it['date'], title)
    for sid, (d, title) in old.items():  # the plan's own runs replace them: no doubles
        g.unschedule_workout(sid)
        print('unscheduled old', d, title)
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
