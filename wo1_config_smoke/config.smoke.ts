import {
  MEMBER_TYPES,
  MEMBER_TYPE_CODES,
  isMemberTypeCode,
  getMemberType,
  memberTypeLabel,
  memberNumberPrefix,
  memberBorrowRights
} from '../src/shared/config/member-type'
import { EDUCATION_LEVELS, levelOrder } from '../src/shared/config/education-level'

let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
  if (ok) pass += 1
  else fail += 1
}

function expectEqual<T>(name: string, actual: T, expected: T): void {
  check(name, actual === expected, `expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`)
}

console.log('--- EducationLevel ---')
expectEqual('levelOrder(X)=1', levelOrder('X'), 1)
expectEqual('levelOrder(XI)=2', levelOrder('XI'), 2)
expectEqual('levelOrder(XII)=3', levelOrder('XII'), 3)
check('levelOrder(invalid)=NaN', Number.isNaN(levelOrder('IX')), `value=${String(levelOrder('IX'))}`)
check(
  'EDUCATION_LEVELS contains X/XI/XII',
  EDUCATION_LEVELS.has('X') && EDUCATION_LEVELS.has('XI') && EDUCATION_LEVELS.has('XII')
)
check('EDUCATION_LEVELS rejects IX', !EDUCATION_LEVELS.has('IX'))

console.log('--- MemberType table ---')
expectEqual('member type count', MEMBER_TYPE_CODES.length, 3)
expectEqual('student label', memberTypeLabel('student'), 'Siswa')
expectEqual('teacher label', memberTypeLabel('teacher'), 'Guru')
expectEqual('general label', memberTypeLabel('general'), 'Umum')
expectEqual('student prefix', memberNumberPrefix('student'), 'S')
expectEqual('teacher prefix', memberNumberPrefix('teacher'), 'G')
expectEqual('general prefix', memberNumberPrefix('general'), 'U')
expectEqual('default prefix (unknown)', memberNumberPrefix('unknown'), 'S')
expectEqual('default prefix (empty)', memberNumberPrefix(''), 'S')
expectEqual('default prefix (undefined)', memberNumberPrefix(undefined), 'S')
const studentRights = memberBorrowRights('student')
check(
  'student rights 2/7/1x',
  studentRights?.maxBooks === 2 && studentRights?.maxDays === 7 && studentRights?.extensions === '1x',
  JSON.stringify(studentRights)
)
const teacherRights = memberBorrowRights('teacher')
check(
  'teacher rights 5/30/3x',
  teacherRights?.maxBooks === 5 && teacherRights?.maxDays === 30 && teacherRights?.extensions === '3x',
  JSON.stringify(teacherRights)
)
const generalRights = memberBorrowRights('general')
check(
  'general rights 10/90/Tidak Terbatas',
  generalRights?.maxBooks === 10 &&
    generalRights?.maxDays === 90 &&
    generalRights?.extensions === 'Tidak Terbatas',
  JSON.stringify(generalRights)
)
check('unknown rights null', memberBorrowRights('unknown') === null)
expectEqual('student hasAcademicRecord', MEMBER_TYPES.student.hasAcademicRecord, true)
expectEqual('teacher hasAcademicRecord', MEMBER_TYPES.teacher.hasAcademicRecord, false)
expectEqual('general hasAcademicRecord', MEMBER_TYPES.general.hasAcademicRecord, false)
check(
  'isMemberTypeCode valid',
  isMemberTypeCode('student') && isMemberTypeCode('teacher') && isMemberTypeCode('general')
)
check('isMemberTypeCode invalid', !isMemberTypeCode('alumni'))
expectEqual('label unknown null', memberTypeLabel('alumni'), null)
expectEqual('label empty null', memberTypeLabel(''), null)
expectEqual('label undefined null', memberTypeLabel(undefined), null)

console.log('--- label vs config consistency ---')
for (const code of MEMBER_TYPE_CODES) {
  check(`label matches config for ${code}`, memberTypeLabel(code) === MEMBER_TYPES[code].label)
}

console.log('--- getMemberType primitive ---')
check(
  'getMemberType(student) returns full object',
  getMemberType('student')?.code === 'student' &&
    getMemberType('student')?.hasAcademicRecord === true &&
    getMemberType('student')?.memberNumberPrefix === 'S' &&
    getMemberType('student')?.borrowRights.maxBooks === 2
)
expectEqual('getMemberType(teacher).label', getMemberType('teacher')?.label, 'Guru')
expectEqual('getMemberType(general).prefix', getMemberType('general')?.memberNumberPrefix, 'U')
check('getMemberType(unknown) null', getMemberType('alumni') === null)
check('getMemberType(empty) null', getMemberType('') === null)
check('getMemberType(undefined) null', getMemberType(undefined) === null)

console.log('--- projections delegate to getMemberType ---')
for (const code of MEMBER_TYPE_CODES) {
  check(`memberTypeLabel(${code}) matches getMemberType`, memberTypeLabel(code) === getMemberType(code)?.label)
  check(`memberNumberPrefix(${code}) matches getMemberType`, memberNumberPrefix(code) === getMemberType(code)?.memberNumberPrefix)
  check(
    `memberBorrowRights(${code}) matches getMemberType`,
    JSON.stringify(memberBorrowRights(code)) === JSON.stringify(getMemberType(code)?.borrowRights)
  )
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
