"""Read-only lot usage plans using the same FEFO simulation as allocation."""
from datetime import timedelta
from .engine import batches_for, arrivals_for, simulate, dt, usable


def usage_plan(state, facility, supply_id, horizon=28, scenario='planning'):
    forecast = state['forecasts'].get(f'{facility}:{supply_id}')
    demo = state['settings']['demo']
    if not forecast:
        return {'status': 'awaiting_forecast', 'lots': [], 'days': []}
    run = state['runs'].get(forecast['run_id'], {})
    if run.get('revision') != demo['revision']:
        return {'status': 'updating', 'lots': [], 'days': []}
    demand = forecast[scenario][:horizon]
    start = demo['as_of']
    supply = state['supplies'][supply_id]
    batches = batches_for(state, facility, supply_id)
    arrivals = [a for a in arrivals_for(state, facility, supply_id)
                if a.get('confirmed', True) and a.get('status') not in ('received', 'cancelled')]
    days, previous = [], {}
    prior_unmet = 0
    for day in range(1, len(demand) + 1):
        result = simulate(batches, demand[:day], start, arrivals)
        allocations = [{'id': bid, 'quantity': round(qty - previous.get(bid, 0), 3)}
                       for bid, qty in result['consumed'].items() if qty - previous.get(bid, 0) > 1e-6]
        days.append({'day': day, 'date': (dt(start) + timedelta(days=day-1)).isoformat(),
                     'demand': demand[day-1], 'allocations': allocations,
                     'unmet': round(result['unmet'] - prior_unmet, 3),
                     'stock': result['timeline'][-1]['stock']})
        previous, prior_unmet = result['consumed'], result['unmet']
    result = simulate(batches, demand, start, arrivals)
    lots = []
    own = [b for b in state['batches'].values() if b['facility_id'] == facility and b['supply_id'] == supply_id]
    for b, incoming in [(b, False) for b in own] + [(a, True) for a in arrivals if dt(a['arrives_at']) < dt(start) + timedelta(days=len(demand))]:
        available = max(0, b['quantity'] - b.get('reserved', 0))
        reason = None
        if not incoming:
            if b.get('quarantined'): reason = 'Quarantined'
            elif dt(b['expires_at']) <= dt(start): reason = 'Expired'
            elif not usable(b, supply, start): reason = 'Storage or unit mismatch'
            elif available == 0: reason = 'No unreserved stock'
        used = result['consumed'].get(b['id'], 0)
        wasted = result['batch_waste'].get(b['id'], 0)
        use_days = [d['day'] for d in days if any(a['id'] == b['id'] for a in d['allocations'])]
        lots.append({'id': b['id'], 'lot': b.get('lot', b['id']), 'quantity': b['quantity'],
                     'available': 0 if reason else available, 'reserved': b.get('reserved', 0),
                     'expires_at': b['expires_at'], 'arrives_at': b.get('arrives_at', start),
                     'incoming': incoming, 'excluded_reason': reason,
                     'used': round(used, 3), 'waste': round(wasted, 3),
                     'remaining': round(max(0, available-used-wasted), 3) if not reason else 0,
                     'first_day': min(use_days) if use_days else None, 'last_day': max(use_days) if use_days else None})
    lots.sort(key=lambda b: (b['excluded_reason'] is not None, b['expires_at'], b['id']))
    return {'status': 'ready', 'facility_id': facility, 'supply_id': supply_id, 'as_of': start,
            'run_id': forecast['run_id'], 'model': forecast['model'], 'scenario': scenario,
            'horizon': len(demand), 'demand': round(sum(demand), 3), 'unmet': result['unmet'],
            'waste': result['waste'], 'stockout_days': result['stockout_days'], 'lots': lots, 'days': days}
