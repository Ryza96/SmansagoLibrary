export interface BaseQueryDTO {
  search?: string
}

export interface FindAuthorsQueryDTO extends BaseQueryDTO {}

export interface FindPublishersQueryDTO extends BaseQueryDTO {}

export interface FindCategoriesQueryDTO extends BaseQueryDTO {}

export interface AuthorDTO {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface CreateAuthorDTO {
  name: string
}

export interface UpdateAuthorDTO {
  name: string
}

export interface PublisherDTO {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface CreatePublisherDTO {
  name: string
}

export interface UpdatePublisherDTO {
  name: string
}

export interface CategoryDTO {
  id: string
  code: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateCategoryDTO {
  code: string
  name: string
  description?: string
}

export interface UpdateCategoryDTO {
  code: string
  name: string
  description?: string | null
}
