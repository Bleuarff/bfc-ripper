export class MissingFieldsError extends Error {
  fields: string[]

  constructor(fields: string[]){
    super()
    this.message = 'Missing fields'
    this.fields = fields
  }
}

export class InvalidValueError extends Error {
  field: string
  value: string

  constructor(field: string, value: string) {
    super()
    this.field = field
    this.value = value
  }
}