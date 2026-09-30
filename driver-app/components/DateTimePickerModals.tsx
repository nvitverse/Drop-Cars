import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, Platform } from 'react-native';
import { X, ChevronLeft, ChevronRight } from 'lucide-react-native';

// Ported from the Driver App's create-booking.tsx (same calendar-grid date
// picker + wheel-scroll time picker) so every app's booking screens share
// one date/time picker UX instead of raw "YYYY-MM-DD" / "HH:MM" text
// fields the admin has to type by hand.

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_SHORT = ['Su','Mo','Tu','We','Th','Fr','Sa'];

export function CustomDatePickerModal({ visible, title, initialDate, minimumDate, onConfirm, onClose }: {
  visible: boolean; title: string; initialDate: Date;
  minimumDate?: Date; onConfirm: (d: Date) => void; onClose: () => void;
}) {
  const [sel, setSel] = React.useState(() => new Date(initialDate));
  const [viewMonth, setViewMonth] = React.useState(() => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));

  React.useEffect(() => {
    if (visible) { setSel(new Date(initialDate)); setViewMonth(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1)); }
  }, [visible]);

  const prevMonth = () => setViewMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setViewMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const firstDay = viewMonth.getDay();
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const today = new Date(); today.setHours(0,0,0,0);
  const minD = minimumDate ? new Date(minimumDate) : today; minD.setHours(0,0,0,0);

  const cells: (number|null)[] = [...Array(firstDay).fill(null), ...Array.from({length: daysInMonth}, (_,i) => i+1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const isDisabled = (day: number) => {
    const d = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
    return d < minD;
  };
  const isSelected = (day: number) =>
    sel.getDate() === day && sel.getMonth() === viewMonth.getMonth() && sel.getFullYear() === viewMonth.getFullYear();
  const isToday = (day: number) => {
    const d = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
    d.setHours(0,0,0,0);
    return d.getTime() === today.getTime();
  };

  const pick = (day: number) => {
    if (isDisabled(day)) return;
    const d = new Date(sel);
    d.setFullYear(viewMonth.getFullYear(), viewMonth.getMonth(), day);
    setSel(d);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.45)', justifyContent:'flex-end'}}>
        <View style={{backgroundColor:'#FFF', borderTopLeftRadius:24, borderTopRightRadius:24, paddingTop:8, paddingBottom: Platform.OS==='ios'?40:24}}>
          <View style={{width:40,height:4,borderRadius:2,backgroundColor:'#E2E8F0',alignSelf:'center',marginBottom:4}}/>

          <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingVertical:12}}>
            <Text style={{fontSize:17,fontWeight:'700',color:'#0F172A'}}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={{padding:4}}>
              <X size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,marginBottom:12}}>
            <TouchableOpacity onPress={prevMonth} style={{padding:8,borderRadius: 10,backgroundColor:'#F1F5F9'}}>
              <ChevronLeft size={18} color="#1D4ED8" />
            </TouchableOpacity>
            <Text style={{fontSize:16,fontWeight:'700',color:'#1E293B'}}>
              {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
            </Text>
            <TouchableOpacity onPress={nextMonth} style={{padding:8,borderRadius: 10,backgroundColor:'#F1F5F9'}}>
              <ChevronRight size={18} color="#1D4ED8" />
            </TouchableOpacity>
          </View>

          <View style={{flexDirection:'row',paddingHorizontal:16,marginBottom:4}}>
            {DAYS_SHORT.map(d => (
              <View key={d} style={{flex:1,alignItems:'center'}}>
                <Text style={{fontSize:12,fontWeight:'600',color:'#94A3B8'}}>{d}</Text>
              </View>
            ))}
          </View>

          <View style={{paddingHorizontal:16}}>
            {Array.from({length: cells.length/7}, (_,row) => (
              <View key={row} style={{flexDirection:'row',marginBottom:4}}>
                {cells.slice(row*7, row*7+7).map((day, col) => {
                  if (!day) return <View key={col} style={{flex:1}}/>;
                  const disabled = isDisabled(day);
                  const selected = isSelected(day);
                  const todayCell = isToday(day);
                  return (
                    <TouchableOpacity key={col} style={{flex:1,alignItems:'center'}} onPress={() => pick(day)} activeOpacity={0.7}>
                      <View style={{
                        width:38, height:38, borderRadius:19, justifyContent:'center', alignItems:'center',
                        backgroundColor: selected ? '#1D4ED8' : todayCell ? '#EFF6FF' : 'transparent',
                        borderWidth: todayCell && !selected ? 1.5 : 0,
                        borderColor: '#1D4ED8',
                      }}>
                        <Text style={{
                          fontSize:14, fontWeight: selected||todayCell ? '700' : '400',
                          color: selected ? '#FFF' : disabled ? '#CBD5E1' : todayCell ? '#1D4ED8' : '#1E293B',
                        }}>{day}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>

          <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingTop:16,marginTop:4,borderTopWidth:1,borderTopColor:'#F1F5F9'}}>
            <Text style={{fontSize:14,color:'#475569',fontWeight:'500'}}>
              {sel.toLocaleDateString('en-IN', {weekday:'short', day:'2-digit', month:'short', year:'numeric'})}
            </Text>
            <TouchableOpacity onPress={() => onConfirm(sel)}
              style={{backgroundColor:'#1D4ED8',paddingHorizontal:24,paddingVertical:11,borderRadius: 6}}>
              <Text style={{color:'#FFF',fontWeight:'700',fontSize:15}}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const PICKER_ITEM_H = 48;
const PICKER_VISIBLE = 5;

function TimeWheelColumn({ items, selectedIndex, onSelect }: { items: string[]; selectedIndex: number; onSelect: (i: number) => void; }) {
  const ref = React.useRef<ScrollView>(null);
  React.useEffect(() => {
    ref.current?.scrollTo({ y: selectedIndex * PICKER_ITEM_H, animated: false });
  }, [selectedIndex]);

  return (
    <ScrollView
      ref={ref}
      style={{height: PICKER_ITEM_H * PICKER_VISIBLE, width: 72}}
      showsVerticalScrollIndicator={false}
      snapToInterval={PICKER_ITEM_H}
      decelerationRate="fast"
      contentContainerStyle={{paddingVertical: PICKER_ITEM_H * 2}}
      onMomentumScrollEnd={e => {
        const idx = Math.round(e.nativeEvent.contentOffset.y / PICKER_ITEM_H);
        onSelect(Math.max(0, Math.min(idx, items.length - 1)));
      }}
    >
      {items.map((item, i) => (
        <TouchableOpacity key={i} onPress={() => { onSelect(i); ref.current?.scrollTo({ y: i * PICKER_ITEM_H, animated: true }); }} activeOpacity={0.7}
          style={{height: PICKER_ITEM_H, justifyContent:'center', alignItems:'center'}}>
          <Text style={{
            fontSize: i === selectedIndex ? 22 : 16,
            fontWeight: i === selectedIndex ? '700' : '400',
            color: i === selectedIndex ? '#1D4ED8' : '#94A3B8',
          }}>{item}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

export function CustomTimePickerModal({ visible, title, initialDate, onConfirm, onClose }: {
  visible: boolean; title: string; initialDate: Date; onConfirm: (d: Date) => void; onClose: () => void;
}) {
  const hours12 = Array.from({length:12}, (_,i) => String(i+1).padStart(2,'0'));
  const minutes = Array.from({length:60}, (_,i) => String(i).padStart(2,'0'));
  const periods = ['AM','PM'];

  const initH = initialDate.getHours();
  const [hIdx, setHIdx] = React.useState(() => initH % 12 === 0 ? 11 : (initH % 12) - 1);
  const [mIdx, setMIdx] = React.useState(() => initialDate.getMinutes());
  const [pIdx, setPIdx] = React.useState(() => initH >= 12 ? 1 : 0);

  React.useEffect(() => {
    if (visible) {
      const h = initialDate.getHours();
      setHIdx(h % 12 === 0 ? 11 : (h % 12) - 1);
      setMIdx(initialDate.getMinutes());
      setPIdx(h >= 12 ? 1 : 0);
    }
  }, [visible]);

  const confirm = () => {
    const d = new Date(initialDate);
    let h = hIdx + 1;
    if (pIdx === 1 && h !== 12) h += 12;
    if (pIdx === 0 && h === 12) h = 0;
    d.setHours(h, mIdx, 0, 0);
    onConfirm(d);
  };

  const displayTime = () => {
    const h = String(hIdx + 1).padStart(2, '0');
    const m = String(mIdx).padStart(2, '0');
    return `${h}:${m} ${periods[pIdx]}`;
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.45)', justifyContent:'flex-end'}}>
        <View style={{backgroundColor:'#FFF', borderTopLeftRadius:24, borderTopRightRadius:24, paddingBottom: Platform.OS==='ios'?40:24}}>
          <View style={{width:40,height:4,borderRadius:2,backgroundColor:'#E2E8F0',alignSelf:'center',marginTop:8,marginBottom:4}}/>

          <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingVertical:12}}>
            <Text style={{fontSize:17,fontWeight:'700',color:'#0F172A'}}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={{padding:4}}>
              <X size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <View style={{alignItems:'center',paddingVertical:8}}>
            <View style={{position:'absolute',top: PICKER_ITEM_H * Math.floor(PICKER_VISIBLE / 2), left:0, right:0, height:PICKER_ITEM_H,
              backgroundColor:'#EFF6FF', borderTopWidth:1.5, borderBottomWidth:1.5, borderColor:'#BFDBFE'}}/>

            <View style={{flexDirection:'row', alignItems:'center', gap:4}}>
              <TimeWheelColumn items={hours12} selectedIndex={hIdx} onSelect={setHIdx} />
              <Text style={{fontSize:26,fontWeight:'700',color:'#1D4ED8',marginBottom:4}}>:</Text>
              <TimeWheelColumn items={minutes} selectedIndex={mIdx} onSelect={setMIdx} />
              <View style={{width:4}}/>
              <TimeWheelColumn items={periods} selectedIndex={pIdx} onSelect={setPIdx} />
            </View>
          </View>

          <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingTop:12,borderTopWidth:1,borderTopColor:'#F1F5F9'}}>
            <Text style={{fontSize:22,fontWeight:'700',color:'#1D4ED8'}}>{displayTime()}</Text>
            <TouchableOpacity onPress={confirm}
              style={{backgroundColor:'#1D4ED8',paddingHorizontal:24,paddingVertical:11,borderRadius: 6}}>
              <Text style={{color:'#FFF',fontWeight:'700',fontSize:15}}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
